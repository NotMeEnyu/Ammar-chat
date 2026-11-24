import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'

initializeApp()
const db = getFirestore()
const OWNER_EMAIL = defineSecret('OWNER_EMAIL')

async function requireOwner(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) throw new Error('Missing authentication token.')
  const decoded = await getAuth().verifyIdToken(header.slice(7))
  const user = await db.doc(`users/${decoded.uid}`).get()
  const email = (decoded.email || '').toLowerCase()
  const ownerEmail = (process.env.OWNER_EMAIL || '').toLowerCase()
  if (!user.exists || (user.data().role !== 'owner' && (!ownerEmail || email !== ownerEmail))) {
    throw new Error('Owner permission required.')
  }
  return decoded
}

export const adminAction = onRequest({ cors: true, secrets: [OWNER_EMAIL] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error:'POST required'})
  try {
    const owner = await requireOwner(req)
    const { action, targetId, groupId } = req.body || {}
    if (!targetId || targetId === owner.uid) return res.status(400).json({error:'Invalid target user.'})
    if (action === 'banUser') {
      await db.doc(`users/${targetId}`).update({banned:true, bannedAt:FieldValue.serverTimestamp(), bannedBy:owner.uid})
      await getAuth().updateUser(targetId, {disabled:true})
      return res.json({message:'User banned and sign-in disabled.'})
    }
    if (action === 'unbanUser') {
      await db.doc(`users/${targetId}`).update({banned:false, bannedAt:FieldValue.delete(), bannedBy:FieldValue.delete()})
      await getAuth().updateUser(targetId, {disabled:false})
      return res.json({message:'User unbanned.'})
    }
    if (action === 'kickFromGroup') {
      if (!groupId) return res.status(400).json({error:'Group ID required.'})
      const groupRef = db.doc(`groups/${groupId}`)
      const snap = await groupRef.get()
      if (!snap.exists) return res.status(404).json({error:'Group not found.'})
      const group = snap.data()
      if (group.ownerId === targetId) return res.status(400).json({error:'Cannot kick the group owner.'})
      await groupRef.update({members:(group.members || []).filter(uid => uid !== targetId)})
      return res.json({message:'Member removed from group.'})
    }
    return res.status(400).json({error:'Unknown admin action.'})
  } catch (e) {
    const status = e.message?.includes('permission') ? 403 : 401
    return res.status(status).json({error:e.message || 'Request failed.'})
  }
})
