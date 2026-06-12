import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// Equipment Tab
function EquipmentTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', type: '', serial_number: '', status: 'active', notes: '' });
  const [editId, setEditId] = useState(null);

  const load = () => axios.get(`/api/clients/${clientId}/equipment`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [clientId]);

  const openAdd = () => { setForm({ name: '', type: '', serial_number: '', status: 'active', notes: '' }); setEditId(null); setShowModal(true); };
  const openEdit = (item) => {
    setForm({ name: item.name, type: item.type || '', serial_number: item.serial_number || '', status: item.status || 'active', notes: item.notes || '' });
    setEditId(item.id);
    setShowModal(true);
  };
  const handleDelete = async (id) => {
    if (!confirm('Supprimer cet équipement ?')) return;
    await axios.delete(`/api/clients/${clientId}/equipment/${id}`);
    load();
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) await axios.put(`/api/clients/${clientId}/equipment/${editId}`, form);
    else await axios.post(`/api/clients/${clientId}/equipment`, form);
    setShowModal(false);
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">Équipements ({items.length})</h3>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">+ Ajouter</button>
      </div>
      {items.length === 0 ? <p className="text-gray-500 text-sm">Aucun équipement.</p> : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-gray-50 rounded-lg p-4 flex items-start justify-between">
              <div>
                <p className="font-medium text-gray-800">{item.name}</p>
                <p className="text-sm text-gray-500">{item.type} {item.serial_number ? `• S/N: ${item.serial_number}` : ''}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{item.status}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(item)} className="text-blue-600 text-sm hover:underline">Modifier</button>
                <button onClick={() => handleDelete(item.id)} className="text-red-600 text-sm hover:underline">Suppr.</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <Modal title={editId ? 'Modifier équipement' : 'Nouvel équipement'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <input value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">N° Série</label>
              <input value={form.serial_number} onChange={e => setForm({...form, serial_number: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="active">Actif</option><option value="inactive">Inactif</option><option value="maintenance">Maintenance</option>
              </select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg">Annuler</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{editId ? 'Modifier' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Procedures Tab
function ProceduresTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'onsite', content: '' });
  const [editId, setEditId] = useState(null);

  const load = () => axios.get(`/api/clients/${clientId}/procedures`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [clientId]);

  const openAdd = () => { setForm({ title: '', type: 'onsite', content: '' }); setEditId(null); setShowModal(true); };
  const openEdit = (item) => { setForm({ title: item.title, type: item.type, content: item.content || '' }); setEditId(item.id); setShowModal(true); };
  const handleDelete = async (id) => { if (!confirm('Supprimer ?')) return; await axios.delete(`/api/clients/${clientId}/procedures/${id}`); load(); };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) await axios.put(`/api/clients/${clientId}/procedures/${editId}`, form);
    else await axios.post(`/api/clients/${clientId}/procedures`, form);
    setShowModal(false); load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">Procédures ({items.length})</h3>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">+ Ajouter</button>
      </div>
      {items.length === 0 ? <p className="text-gray-500 text-sm">Aucune procédure.</p> : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-800">{item.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${item.type === 'remote' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {item.type === 'remote' ? 'Distanciel' : 'Sur site'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(item)} className="text-blue-600 text-sm hover:underline">Modifier</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 text-sm hover:underline">Suppr.</button>
                </div>
              </div>
              {item.content && <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{item.content}</p>}
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <Modal title={editId ? 'Modifier procédure' : 'Nouvelle procédure'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
              <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="onsite">Sur site</option><option value="remote">Distanciel</option>
              </select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Contenu</label>
              <textarea rows={6} value={form.content} onChange={e => setForm({...form, content: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg">Annuler</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{editId ? 'Modifier' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Passwords Tab
function PasswordsTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ label: '', username: '', password: '', url: '', notes: '' });
  const [editId, setEditId] = useState(null);

  const load = () => axios.get(`/api/clients/${clientId}/passwords`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [clientId]);

  const openAdd = () => { setForm({ label: '', username: '', password: '', url: '', notes: '' }); setEditId(null); setShowModal(true); };
  const openEdit = (item) => { setForm({ label: item.label, username: item.username || '', password: item.password || '', url: item.url || '', notes: item.notes || '' }); setEditId(item.id); setShowModal(true); };
  const handleDelete = async (id) => { if (!confirm('Supprimer ?')) return; await axios.delete(`/api/clients/${clientId}/passwords/${id}`); load(); };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) await axios.put(`/api/clients/${clientId}/passwords/${editId}`, form);
    else await axios.post(`/api/clients/${clientId}/passwords`, form);
    setShowModal(false); load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">Mots de passe ({items.length})</h3>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">+ Ajouter</button>
      </div>
      {items.length === 0 ? <p className="text-gray-500 text-sm">Aucun mot de passe.</p> : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{item.label}</p>
                  {item.username && <p className="text-sm text-gray-600">Utilisateur: {item.username}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-600 font-mono">
                      {revealed[item.id] ? item.password : '••••••••'}
                    </span>
                    <button onClick={() => setRevealed(r => ({...r, [item.id]: !r[item.id]}))} className="text-gray-400 hover:text-gray-600 text-sm">
                      {revealed[item.id] ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{item.url}</a>}
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => openEdit(item)} className="text-blue-600 text-sm hover:underline">Modifier</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 text-sm hover:underline">Suppr.</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <Modal title={editId ? 'Modifier mot de passe' : 'Nouveau mot de passe'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
              <input required value={form.label} onChange={e => setForm({...form, label: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Utilisateur</label>
              <input value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe *</label>
              <input required type="text" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input value={form.url} onChange={e => setForm({...form, url: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg">Annuler</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{editId ? 'Modifier' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Contacts Tab
function ContactsTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', role: '', phone: '', email: '', notes: '' });
  const [editId, setEditId] = useState(null);

  const load = () => axios.get(`/api/clients/${clientId}/contacts`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [clientId]);

  const openAdd = () => { setForm({ name: '', role: '', phone: '', email: '', notes: '' }); setEditId(null); setShowModal(true); };
  const openEdit = (item) => { setForm({ name: item.name, role: item.role || '', phone: item.phone || '', email: item.email || '', notes: item.notes || '' }); setEditId(item.id); setShowModal(true); };
  const handleDelete = async (id) => { if (!confirm('Supprimer ?')) return; await axios.delete(`/api/clients/${clientId}/contacts/${id}`); load(); };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) await axios.put(`/api/clients/${clientId}/contacts/${editId}`, form);
    else await axios.post(`/api/clients/${clientId}/contacts`, form);
    setShowModal(false); load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">Contacts ({items.length})</h3>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">+ Ajouter</button>
      </div>
      {items.length === 0 ? <p className="text-gray-500 text-sm">Aucun contact.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map(item => (
            <div key={item.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between">
                <div>
                  <p className="font-medium text-gray-800">{item.name}</p>
                  {item.role && <p className="text-sm text-gray-500">{item.role}</p>}
                  {item.phone && <p className="text-sm text-gray-600">📞 {item.phone}</p>}
                  {item.email && <p className="text-sm text-blue-600">{item.email}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => openEdit(item)} className="text-blue-600 text-sm hover:underline">Modifier</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 text-sm hover:underline">Suppr.</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <Modal title={editId ? 'Modifier contact' : 'Nouveau contact'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
              <input value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg">Annuler</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{editId ? 'Modifier' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// EPI Tab
function EpiTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', type: '', quantity: 1, expiry_date: '', location: '', notes: '' });
  const [editId, setEditId] = useState(null);

  const load = () => axios.get(`/api/clients/${clientId}/epi`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [clientId]);

  const openAdd = () => { setForm({ name: '', type: '', quantity: 1, expiry_date: '', location: '', notes: '' }); setEditId(null); setShowModal(true); };
  const openEdit = (item) => {
    setForm({ name: item.name, type: item.type || '', quantity: item.quantity || 1, expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '', location: item.location || '', notes: item.notes || '' });
    setEditId(item.id); setShowModal(true);
  };
  const handleDelete = async (id) => { if (!confirm('Supprimer ?')) return; await axios.delete(`/api/clients/${clientId}/epi/${id}`); load(); };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) await axios.put(`/api/clients/${clientId}/epi/${editId}`, form);
    else await axios.post(`/api/clients/${clientId}/epi`, form);
    setShowModal(false); load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">EPI ({items.length})</h3>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">+ Ajouter</button>
      </div>
      {items.length === 0 ? <p className="text-gray-500 text-sm">Aucun EPI.</p> : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-gray-50 rounded-lg p-4 flex justify-between">
              <div>
                <p className="font-medium text-gray-800">{item.name}</p>
                <p className="text-sm text-gray-500">{item.type} • Qté: {item.quantity}</p>
                {item.location && <p className="text-sm text-gray-500">Lieu: {item.location}</p>}
                {item.expiry_date && <p className="text-sm text-gray-500">Exp: {new Date(item.expiry_date).toLocaleDateString('fr-FR')}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(item)} className="text-blue-600 text-sm hover:underline">Modifier</button>
                <button onClick={() => handleDelete(item.id)} className="text-red-600 text-sm hover:underline">Suppr.</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <Modal title={editId ? 'Modifier EPI' : 'Nouvel EPI'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <input value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Quantité</label>
                <input type="number" min="1" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
              <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Date d'expiration</label>
              <input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg">Annuler</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{editId ? 'Modifier' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Logbook Tab
function LogbookTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', type: 'note', entry_date: new Date().toISOString().split('T')[0] });
  const [editId, setEditId] = useState(null);

  const load = () => axios.get(`/api/clients/${clientId}/logbook`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [clientId]);

  const openAdd = () => { setForm({ title: '', content: '', type: 'note', entry_date: new Date().toISOString().split('T')[0] }); setEditId(null); setShowModal(true); };
  const openEdit = (item) => {
    setForm({ title: item.title, content: item.content || '', type: item.type || 'note', entry_date: item.entry_date ? item.entry_date.split('T')[0] : '' });
    setEditId(item.id); setShowModal(true);
  };
  const handleDelete = async (id) => { if (!confirm('Supprimer ?')) return; await axios.delete(`/api/clients/${clientId}/logbook/${id}`); load(); };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) await axios.put(`/api/clients/${clientId}/logbook/${editId}`, form);
    else await axios.post(`/api/clients/${clientId}/logbook`, form);
    setShowModal(false); load();
  };

  const typeLabels = { note: 'Note', intervention: 'Intervention', incident: 'Incident', maintenance: 'Maintenance' };
  const typeColors = { note: 'bg-gray-100 text-gray-700', intervention: 'bg-blue-100 text-blue-700', incident: 'bg-red-100 text-red-700', maintenance: 'bg-yellow-100 text-yellow-700' };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">Journal ({items.length})</h3>
        <button onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">+ Ajouter</button>
      </div>
      {items.length === 0 ? <p className="text-gray-500 text-sm">Aucune entrée.</p> : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[item.type] || typeColors.note}`}>{typeLabels[item.type] || item.type}</span>
                    <span className="text-xs text-gray-500">{new Date(item.entry_date).toLocaleDateString('fr-FR')} • {item.user_name}</span>
                  </div>
                  <p className="font-medium text-gray-800">{item.title}</p>
                  {item.content && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.content}</p>}
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => openEdit(item)} className="text-blue-600 text-sm hover:underline">Modifier</button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 text-sm hover:underline">Suppr.</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <Modal title={editId ? 'Modifier entrée' : 'Nouvelle entrée'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
              <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="note">Note</option><option value="intervention">Intervention</option>
                  <option value="incident">Incident</option><option value="maintenance">Maintenance</option>
                </select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={form.entry_date} onChange={e => setForm({...form, entry_date: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Contenu</label>
              <textarea rows={4} value={form.content} onChange={e => setForm({...form, content: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg">Annuler</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{editId ? 'Modifier' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Documents Tab
function DocumentsTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = () => axios.get(`/api/clients/${clientId}/documents`).then(r => setItems(r.data));
  useEffect(() => { load(); }, [clientId]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await axios.post(`/api/clients/${clientId}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      load();
    } catch (err) {
      alert('Erreur upload: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
      fileRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce document ?')) return;
    await axios.delete(`/api/clients/${clientId}/documents/${id}`);
    load();
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-700">Documents ({items.length})</h3>
        <div>
          <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" />
          <button onClick={() => fileRef.current.click()} disabled={uploading} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-3 py-1.5 rounded-lg text-sm">
            {uploading ? 'Upload...' : '+ Uploader'}
          </button>
        </div>
      </div>
      {items.length === 0 ? <p className="text-gray-500 text-sm">Aucun document.</p> : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
              <div>
                <a href={`/uploads/${item.filename}`} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">{item.original_name}</a>
                <p className="text-sm text-gray-500">{formatSize(item.size)} • {item.uploaded_by_name} • {new Date(item.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
              <button onClick={() => handleDelete(item.id)} className="text-red-600 text-sm hover:underline">Suppr.</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'equipment', label: 'Équipements' },
  { id: 'procedures', label: 'Procédures' },
  { id: 'passwords', label: 'Mots de passe' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'epi', label: 'EPI' },
  { id: 'logbook', label: 'Journal' },
  { id: 'documents', label: 'Documents' },
];

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [activeTab, setActiveTab] = useState('equipment');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/clients/${id}`)
      .then(r => setClient(r.data))
      .catch(() => navigate('/clients'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-12 text-gray-500">Chargement...</div>;
  if (!client) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/clients')} className="text-gray-400 hover:text-gray-600">← Clients</button>
        <h1 className="text-2xl font-bold text-gray-800">{client.name}</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><span className="text-xs text-gray-500">Contrat</span><p className="font-medium">{client.contract_number || '—'}</p></div>
          <div><span className="text-xs text-gray-500">Responsable</span><p className="font-medium">{client.manager || '—'}</p></div>
          <div><span className="text-xs text-gray-500">Téléphone</span><p className="font-medium">{client.phone || '—'}</p></div>
          <div><span className="text-xs text-gray-500">Email</span><p className="font-medium">{client.email || '—'}</p></div>
          {client.address && <div className="col-span-2"><span className="text-xs text-gray-500">Adresse</span><p className="font-medium">{client.address}</p></div>}
          {client.notes && <div className="col-span-4"><span className="text-xs text-gray-500">Notes</span><p className="text-gray-600">{client.notes}</p></div>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-200">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}
            >{tab.label}</button>
          ))}
        </div>
        <div className="p-6">
          {activeTab === 'equipment' && <EquipmentTab clientId={id} />}
          {activeTab === 'procedures' && <ProceduresTab clientId={id} />}
          {activeTab === 'passwords' && <PasswordsTab clientId={id} />}
          {activeTab === 'contacts' && <ContactsTab clientId={id} />}
          {activeTab === 'epi' && <EpiTab clientId={id} />}
          {activeTab === 'logbook' && <LogbookTab clientId={id} />}
          {activeTab === 'documents' && <DocumentsTab clientId={id} />}
        </div>
      </div>
    </div>
  );
}
