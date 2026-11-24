import React, { useEffect, useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile
} from 'firebase/auth'
import {
  addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy,
  query, serverTimestamp, setDoc, updateDoc, where, writeBatch, deleteDoc
} from 'firebase/firestore'
import { onDisconnect, onValue, ref, serverTimestamp as rtdbTimestamp, set } from 'firebase/database'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, rtdb, storage } from './firebase'
import { MessageCircle, Users, Search, Plus, Send, LogOut, Shield, Settings, User, X, Image, Crown, Ban, UserX, Trash2, Menu } from 'lucide-react'

const OWNER_EMAIL = 'CHANGE_THIS_TO_YOUR_OWNER_EMAIL@example.com'
const initials = (name='?') => name.slice(0, 1).toUpperCase()
const stamp = (v) => v?.toDate ? v.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState('chats')
  const [active, setActive] = useState(null)
  const [people, setPeople] = useState([])
  const [groups, setGroups] = useState([])
  const [chats, setChats] = useState([])
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [groupPublic, setGroupPublic] = useState(true)
  const [busy, setBusy] = useState(false)
  const [presence, setPresence] = useState({})
  const [notice, setNotice] = useState('')

  const isOwner = !!user && (user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase() || profile?.role === 'owner')

  useEffect(() => onAuthStateChanged(auth, async u => {
    setUser(u)
    setActive(null)
    if (u) {
      const p = await getDoc(doc(db, 'users', u.uid))
      setProfile(p.exists() ? p.data() : null)
    } else setProfile(null)
  }), [])

  useEffect(() => {
    if (!user) return
    const statusRef = ref(rtdb, `status/${user.uid}`)
    const online = { state: 'online', lastChanged: rtdbTimestamp() }
    const offline = { state: 'offline', lastChanged: rtdbTimestamp() }
    onDisconnect(statusRef).set(offline).then(() => set(statusRef, online))
    const unsub = onValue(ref(rtdb, 'status'), snap => setPresence(snap.val() || {}))
    return () => { unsub(); set(statusRef, offline) }
  }, [user])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(query(collection(db, 'users'), limit(150)), snap =>
      setPeople(snap.docs.map(d => ({id:d.id, ...d.data()})).filter(p => p.id !== user.uid && !p.banned))
    )
    return unsub
  }, [user])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(query(collection(db, 'chats'), where('members', 'array-contains', user.uid)), snap =>
      setChats(snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => (b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0)))
    )
    return unsub
  }, [user])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(query(collection(db, 'groups'), where('public', '==', true), limit(100)), snap =>
      setGroups(snap.docs.map(d => ({id:d.id, ...d.data()})).filter(g => g.public || g.members?.includes(user.uid)))
    )
    return unsub
  }, [user])

  useEffect(() => {
    if (!active || !user) { setMessages([]); return }
    const path = active.kind === 'group' ? `groups/${active.id}/messages` : `chats/${active.id}/messages`
    const unsub = onSnapshot(query(collection(db, path), orderBy('createdAt', 'asc'), limit(200)), snap =>
      setMessages(snap.docs.map(d => ({id:d.id, ...d.data()})))
    )
    return unsub
  }, [active, user])

  async function submitAuth(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      if (authMode === 'register') {
        if (displayName.trim().length < 2) throw new Error('Display name must be at least 2 characters.')
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
        await updateProfile(cred.user, { displayName: displayName.trim() })
        const owner = email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase()
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid, email: email.trim().toLowerCase(), displayName: displayName.trim(),
          photoURL: '', bio: '', role: owner ? 'owner' : 'user', banned: false,
          createdAt: serverTimestamp()
        })
      } else await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) { setError(err.message || 'Could not authenticate.') }
    finally { setBusy(false) }
  }

  async function openDM(other) {
    const existing = chats.find(c => c.type === 'dm' && c.members?.includes(other.id))
    if (existing) { setActive({kind:'dm', id:existing.id, title:other.displayName, other}); setTab('chats'); return }
    const pair = [user.uid, other.id].sort()
    const id = pair.join('_')
    const chatRef = doc(db, 'chats', id)
    await setDoc(chatRef, {
      type:'dm', members:pair, memberNames:{[user.uid]:profile?.displayName || user.displayName, [other.id]:other.displayName},
      createdAt:serverTimestamp(), updatedAt:serverTimestamp(), lastMessage:''
    }, {merge:true})
    setActive({kind:'dm', id, title:other.displayName, other}); setTab('chats')
  }

  async function sendMessage(e) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || !active) return
    setDraft('')
    const path = active.kind === 'group' ? `groups/${active.id}/messages` : `chats/${active.id}/messages`
    await addDoc(collection(db, path), {
      text, senderId:user.uid, senderName:profile?.displayName || user.displayName || 'Member',
      createdAt:serverTimestamp()
    })
    const parent = doc(db, active.kind === 'group' ? 'groups' : 'chats', active.id)
    await updateDoc(parent, { lastMessage:text.slice(0,120), updatedAt:serverTimestamp() })
  }

  async function createGroup(e) {
    e.preventDefault()
    if (groupName.trim().length < 3) return setError('Group name must be at least 3 characters.')
    setBusy(true)
    try {
      const group = await addDoc(collection(db, 'groups'), {
        name:groupName.trim(), description:groupDescription.trim(), public:groupPublic,
        ownerId:user.uid, members:[user.uid], moderators:[], createdAt:serverTimestamp(),
        updatedAt:serverTimestamp(), lastMessage:''
      })
      setActive({kind:'group', id:group.id, title:groupName.trim()})
      setShowCreate(false); setGroupName(''); setGroupDescription('')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function joinGroup(g) {
    if (!g.members?.includes(user.uid)) await updateDoc(doc(db,'groups',g.id), {members:[...(g.members||[]),user.uid]})
    setActive({kind:'group', id:g.id, title:g.name}); setTab('chats')
  }

  async function adminAction(action, targetId, groupId=null) {
    if (!isOwner) return setError('Owner access required.')
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/adminAction', {
        method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body:JSON.stringify({action,targetId,groupId})
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Admin action failed.')
      setNotice(data.message || 'Action completed.')
    } catch (e) { setError(`Admin action: ${e.message}. Deploy the Cloud Function and set its URL if needed.`) }
  }

  async function removeMessage(messageId) {
    if (!isOwner && active?.kind !== 'group') return
    const path = active.kind === 'group' ? `groups/${active.id}/messages` : `chats/${active.id}/messages`
    await deleteDoc(doc(db,path,messageId))
  }

  async function uploadAvatar(file) {
    if (!file) return
    const r = storageRef(storage, `avatars/${user.uid}/${Date.now()}-${file.name}`)
    await uploadBytes(r,file)
    const photoURL = await getDownloadURL(r)
    await updateDoc(doc(db,'users',user.uid),{photoURL})
    setProfile(p=>({...p,photoURL}))
  }

  if (!user) return <div className="auth-screen"><div className="brand"><span className="brand-mark">A</span><div><h1>AMMAR CHAT</h1><p>YOUR PEOPLE. YOUR WORLD.</p></div></div><form className="auth-card" onSubmit={submitAuth}>
    <h2>{authMode==='login'?'Welcome back':'Create your account'}</h2>
    {authMode==='register' && <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Display name" required />}
    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" required />
    <input type="password" minLength="6" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password (6+ characters)" required />
    {error && <p className="error">{error}</p>}
    <button className="primary full" disabled={busy}>{busy?'Please wait…':authMode==='login'?'Log in':'Create account'}</button>
    <p className="switch">{authMode==='login'?"New to Ammar Chat?":"Already have an account?"} <button type="button" onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setError('')}}>{authMode==='login'?'Sign up':'Log in'}</button></p>
  </form><p className="auth-foot">Private conversations • Public communities • Real people</p></div>

  const visiblePeople = people.filter(p => (p.displayName||'').toLowerCase().includes(search.toLowerCase()))
  const visibleGroups = groups.filter(g => (g.name||'').toLowerCase().includes(search.toLowerCase()))
  const isGroupOwner = active?.kind==='group' && groups.find(g=>g.id===active.id)?.ownerId===user.uid
  const currentGroup = active?.kind==='group' ? groups.find(g=>g.id===active.id) : null

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand compact"><span className="brand-mark">A</span><div><h1>AMMAR CHAT</h1><p>YOUR PEOPLE. YOUR WORLD.</p></div></div>
      <div className="me"><div className="avatar">{profile?.photoURL?<img src={profile.photoURL}/>:initials(profile?.displayName||user.email)}</div><div className="me-text"><b>{profile?.displayName||user.displayName}</b><small><i className="online-dot"/> Online</small></div><button className="icon-btn" title="Log out" onClick={()=>signOut(auth)}><LogOut size={18}/></button></div>
      <nav>
        <button className={tab==='chats'?'nav-active':''} onClick={()=>setTab('chats')}><MessageCircle/> Chats <span>{chats.length}</span></button>
        <button className={tab==='people'?'nav-active':''} onClick={()=>setTab('people')}><Users/> People</button>
        <button className={tab==='groups'?'nav-active':''} onClick={()=>setTab('groups')}><Users/> Public groups</button>
        <button className={tab==='profile'?'nav-active':''} onClick={()=>setTab('profile')}><User/> Profile</button>
        {isOwner && <button className={tab==='admin'?'nav-active':''} onClick={()=>setTab('admin')}><Shield/> Owner admin</button>}
      </nav>
      <div className="sidebar-bottom"><span className="status-pip"/> Secure connection <small>AMMAR CHAT v1.0</small></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">SOCIAL MESSAGING</span><h2>{active?.title || (tab==='chats'?'Your messages':tab==='people'?'Find people':tab==='groups'?'Discover groups':tab==='profile'?'Your profile':'Owner control center')}</h2></div><div className="top-actions"><label className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search"/></label><button className="primary" onClick={()=>setShowCreate(true)}><Plus size={17}/> Create group</button></div></header>
      {(error||notice) && <div className={error?'notice error':'notice'}>{error||notice}<button onClick={()=>{setError('');setNotice('')}}><X size={15}/></button></div>}
      <div className="content">
        {tab==='chats' && !active && <div className="list-grid"><section className="panel"><div className="panel-head"><h3>Recent chats</h3><span>{chats.length} conversations</span></div>{chats.filter(c=>c.lastMessage?.toLowerCase().includes(search.toLowerCase()) || !search).map(c=><button className="list-row" key={c.id} onClick={()=>setActive({kind:'dm',id:c.id,title:Object.entries(c.memberNames||{}).find(([id])=>id!==user.uid)?.[1]||'Private chat'})}><div className="avatar">{initials(Object.entries(c.memberNames||{}).find(([id])=>id!==user.uid)?.[1]||'P')}</div><div className="row-copy"><b>{Object.entries(c.memberNames||{}).find(([id])=>id!==user.uid)?.[1]||'Private chat'}</b><small>{c.lastMessage||'Start a conversation'}</small></div><span className="arrow">›</span></button>)}{!chats.length&&<div className="empty"><MessageCircle/><b>No chats yet</b><p>Find someone in People to start a conversation.</p><button className="primary" onClick={()=>setTab('people')}>Find people</button></div>}</section><section className="welcome-card"><div className="glow-orb"/><span className="eyebrow">WELCOME TO YOUR COMMUNITY</span><h3>Good conversations<br/><em>start here.</em></h3><p>Message friends privately or create a public group around what you love.</p><button className="primary" onClick={()=>setShowCreate(true)}><Plus size={17}/> Create a group</button></section></div>}
        {tab==='chats' && active && <section className="conversation panel"><div className="conversation-head"><button className="back-btn" onClick={()=>setActive(null)}>←</button><div className="avatar">{initials(active.title)}</div><div className="row-copy"><b>{active.title}</b><small>{active.kind==='group'?'Public group':presence[active.other?.id]?.state==='online'?'Online':'Private conversation'}</small></div>{active.kind==='group'&&<span className="pill">{currentGroup?.members?.length||0} members</span>}</div><div className="message-list">{messages.map(m=><div className={`message ${m.senderId===user.uid?'mine':''}`} key={m.id}><div className="message-meta">{m.senderName} · {stamp(m.createdAt)}</div><div className="bubble">{m.text}</div>{(isOwner||m.senderId===user.uid||isGroupOwner)&&<button className="tiny-delete" title="Delete message" onClick={()=>removeMessage(m.id)}><Trash2 size={13}/></button>}</div>)}</div><form className="composer" onSubmit={sendMessage}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" maxLength="4000"/><button className="send-btn" disabled={!draft.trim()}><Send size={18}/></button></form></section>}
        {tab==='people' && <section className="panel"><div className="panel-head"><h3>People on Ammar Chat</h3><span>{visiblePeople.length} users</span></div>{visiblePeople.map(p=><div className="list-row" key={p.id}><div className="avatar">{p.photoURL?<img src={p.photoURL}/>:initials(p.displayName)}</div><div className="row-copy"><b>{p.displayName}</b><small>{presence[p.id]?.state==='online'?'● Online':'Offline'}</small></div><button className="primary small" onClick={()=>openDM(p)}>Message</button></div>)}</section>}
        {tab==='groups' && <section className="panel"><div className="panel-head"><h3>Discover public groups</h3><button className="primary small" onClick={()=>setShowCreate(true)}><Plus size={15}/> New group</button></div>{visibleGroups.map(g=><div className="list-row" key={g.id}><div className="group-icon"><Users/></div><div className="row-copy"><b>{g.name}</b><small>{g.description||'Community group'} · {g.members?.length||0} members</small></div><button className="primary small" onClick={()=>joinGroup(g)}>{g.members?.includes(user.uid)?'Open':'Join'}</button></div>)}</section>}
        {tab==='profile' && <section className="panel profile-panel"><div className="profile-avatar">{profile?.photoURL?<img src={profile.photoURL}/>:initials(profile?.displayName||'A')}</div><h3>{profile?.displayName}</h3><p>{user.email}</p><label className="upload-btn">Change profile picture <input type="file" accept="image/*" onChange={e=>uploadAvatar(e.target.files?.[0])}/></label><p className="muted">Profile editing and password reset can be added in the next release.</p></section>}
        {tab==='admin' && isOwner && <section className="panel"><div className="panel-head"><h3><Crown size={19}/> Owner controls</h3><span className="pill owner-pill">OWNER</span></div><p className="muted">Actions below are sent to a privileged server function. They will not work until you deploy functions and set the function URL.</p>{people.map(p=><div className="list-row" key={p.id}><div className="avatar">{initials(p.displayName)}</div><div className="row-copy"><b>{p.displayName}</b><small>{p.email} · {p.role||'user'}</small></div><button className="danger small" onClick={()=>adminAction('banUser',p.id)}><Ban size={14}/> Ban</button></div>)}<h3 className="subhead">Group moderation</h3>{groups.map(g=><div className="list-row" key={g.id}><div className="group-icon"><Users/></div><div className="row-copy"><b>{g.name}</b><small>{g.members?.length||0} members</small></div>{g.members?.filter(id=>id!==g.ownerId).slice(0,1).map(id=><button className="danger small" key={id} onClick={()=>adminAction('kickFromGroup',id,g.id)}><UserX size={14}/> Kick member</button>)}</div>)}</section>}
      </div>
    </main>
    {showCreate && <div className="modal-backdrop" onClick={()=>setShowCreate(false)}><form className="modal" onClick={e=>e.stopPropagation()} onSubmit={createGroup}><button type="button" className="modal-close" onClick={()=>setShowCreate(false)}><X/></button><span className="eyebrow">BUILD YOUR COMMUNITY</span><h2>Create a group</h2><input value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="Group name" required minLength="3"/><textarea value={groupDescription} onChange={e=>setGroupDescription(e.target.value)} placeholder="What is this group about?"/><label className="check"><input type="checkbox" checked={groupPublic} onChange={e=>setGroupPublic(e.target.checked)}/> Public — anyone can discover and join</label><button className="primary full" disabled={busy}>{busy?'Creating…':'Create group'}</button></form></div>}
  </div>
}
