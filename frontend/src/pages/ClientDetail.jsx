import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

// ---- Generic CRUD Modal ----
function GenericModal({ title, fields, initialData, onClose, onSave }) {
  const [form, setForm] = useState(initialData || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  value={form[f.key] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  rows={3}
                  required={f.required}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              ) : f.type === 'select' ? (
                <select
                  value={form[f.key] || f.options[0].value}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  type={f.type || 'text'}
                  value={form[f.key] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  required={f.required}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              )}
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm">Annuler</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm">
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Equipment Tab ----
function EquipmentTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);

  const fetch = useCallback(async () => {
    const res = await axios.get(`/api/clients/${clientId}/equipment`);
    setItems(res.data);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const fields = [
    { key: 'name', label: 'Nom *', required: true },
    { key: 'type', label: 'Type' },
    { key: 'serial_number', label: 'N° de série' },
    { key: 'installation_date', label: 'Date installation', type: 'date' },
    { key: 'last_maintenance', label: 'Dernière maintenance', type: 'date' },
    { key: 'next_maintenance', label: 'Prochaine maintenance', type: 'date' },
    { key: 'status', label: 'Statut', type: 'select', options: [{ value: 'active', label: 'Actif' }, { value: 'inactive', label: 'Inactif' }, { value: 'maintenance', label: 'En maintenance' }] },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal({})} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">+ Ajouter</button>
      </div>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-gray-50 rounded-xl p-4 flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500">{item.type} {item.serial_number && `· S/N: ${item.serial_number}`}</p>
              {item.next_maintenance && <p className="text-xs text-orange-600 mt-1">Prochaine maintenance: {new Date(item.next_maintenance).toLocaleDateString('fr-FR')}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModal(item)} className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100 transition-colors">Modifier</button>
              <button onClick={async () => { if (confirm('Supprimer ?')) { await axios.delete(`/api/clients/${clientId}/equipment/${item.id}`); fetch(); } }} className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors">Supprimer</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Aucun équipement</p>}
      </div>
      {modal !== null && (
        <GenericModal
          title={modal.id ? 'Modifier équipement' : 'Nouvel équipement'}
          fields={fields}
          initialData={modal}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.id) await axios.put(`/api/clients/${clientId}/equipment/${modal.id}`, data);
            else await axios.post(`/api/clients/${clientId}/equipment`, data);
            fetch();
          }}
        />
      )}
    </div>
  );
}

// ---- Procedures Tab ----
function ProceduresTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);

  const fetch = useCallback(async () => {
    const res = await axios.get(`/api/clients/${clientId}/procedures`);
    setItems(res.data);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const fields = [
    { key: 'title', label: 'Titre *', required: true },
    { key: 'type', label: 'Type', type: 'select', options: [{ value: 'onsite', label: 'Présentiel' }, { value: 'remote', label: 'Distanciel' }] },
    { key: 'content', label: 'Contenu', type: 'textarea' },
  ];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal({})} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">+ Ajouter</button>
      </div>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${item.type === 'remote' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                    {item.type === 'remote' ? 'Distanciel' : 'Présentiel'}
                  </span>
                </div>
                {item.content && <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.content}</p>}
              </div>
              <div className="flex gap-2 ml-4">
                <button onClick={() => setModal(item)} className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100">Modifier</button>
                <button onClick={async () => { if (confirm('Supprimer ?')) { await axios.delete(`/api/clients/${clientId}/procedures/${item.id}`); fetch(); } }} className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded">Supprimer</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Aucune procédure</p>}
      </div>
      {modal !== null && (
        <GenericModal
          title={modal.id ? 'Modifier procédure' : 'Nouvelle procédure'}
          fields={fields}
          initialData={modal}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.id) await axios.put(`/api/clients/${clientId}/procedures/${modal.id}`, data);
            else await axios.post(`/api/clients/${clientId}/procedures`, data);
            fetch();
          }}
        />
      )}
    </div>
  );
}

// ---- Passwords Tab ----
function PasswordsTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);
  const [visible, setVisible] = useState({});

  const fetch = useCallback(async () => {
    const res = await axios.get(`/api/clients/${clientId}/passwords`);
    setItems(res.data);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const fields = [
    { key: 'label', label: 'Label *', required: true },
    { key: 'username', label: "Nom d'utilisateur" },
    { key: 'password', label: 'Mot de passe *', type: 'password', required: true },
    { key: 'url', label: 'URL' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal({})} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">+ Ajouter</button>
      </div>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-gray-50 rounded-xl p-4 flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-900">{item.label}</p>
              {item.username && <p className="text-sm text-gray-500">Utilisateur: {item.username}</p>}
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm font-mono text-gray-700">
                  {visible[item.id] ? item.password : '••••••••'}
                </p>
                <button
                  onClick={() => setVisible(v => ({ ...v, [item.id]: !v[item.id] }))}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {visible[item.id] ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline mt-1 block">{item.url}</a>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModal({ ...item, password: item.password })} className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100">Modifier</button>
              <button onClick={async () => { if (confirm('Supprimer ?')) { await axios.delete(`/api/clients/${clientId}/passwords/${item.id}`); fetch(); } }} className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded">Supprimer</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Aucun mot de passe</p>}
      </div>
      {modal !== null && (
        <GenericModal
          title={modal.id ? 'Modifier mot de passe' : 'Nouveau mot de passe'}
          fields={fields}
          initialData={modal}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.id) await axios.put(`/api/clients/${clientId}/passwords/${modal.id}`, data);
            else await axios.post(`/api/clients/${clientId}/passwords`, data);
            fetch();
          }}
        />
      )}
    </div>
  );
}

// ---- Contacts Tab ----
function ContactsTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);

  const fetch = useCallback(async () => {
    const res = await axios.get(`/api/clients/${clientId}/contacts`);
    setItems(res.data);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const fields = [
    { key: 'name', label: 'Nom *', required: true },
    { key: 'role', label: 'Fonction' },
    { key: 'phone', label: 'Téléphone' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal({})} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">+ Ajouter</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.id} className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-gray-900">{item.name}</p>
                {item.role && <p className="text-sm text-blue-600">{item.role}</p>}
                {item.phone && <p className="text-sm text-gray-500">📞 {item.phone}</p>}
                {item.email && <p className="text-sm text-gray-500">✉️ {item.email}</p>}
                {item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => setModal(item)} className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100">Modifier</button>
                <button onClick={async () => { if (confirm('Supprimer ?')) { await axios.delete(`/api/clients/${clientId}/contacts/${item.id}`); fetch(); } }} className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded">Supprimer</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8 col-span-2">Aucun contact</p>}
      </div>
      {modal !== null && (
        <GenericModal
          title={modal.id ? 'Modifier contact' : 'Nouveau contact'}
          fields={fields}
          initialData={modal}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.id) await axios.put(`/api/clients/${clientId}/contacts/${modal.id}`, data);
            else await axios.post(`/api/clients/${clientId}/contacts`, data);
            fetch();
          }}
        />
      )}
    </div>
  );
}

// ---- EPI Tab ----
function EpiTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);

  const fetch = useCallback(async () => {
    const res = await axios.get(`/api/clients/${clientId}/epi`);
    setItems(res.data);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const fields = [
    { key: 'name', label: 'Nom *', required: true },
    { key: 'type', label: 'Type' },
    { key: 'quantity', label: 'Quantité', type: 'number' },
    { key: 'expiry_date', label: "Date d'expiration", type: 'date' },
    { key: 'location', label: 'Emplacement' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal({})} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">+ Ajouter</button>
      </div>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-gray-50 rounded-xl p-4 flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500">
                {item.type && `${item.type} · `}Qté: {item.quantity}
                {item.location && ` · ${item.location}`}
              </p>
              {item.expiry_date && (
                <p className="text-xs text-orange-600 mt-1">
                  Expiration: {new Date(item.expiry_date).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModal(item)} className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100">Modifier</button>
              <button onClick={async () => { if (confirm('Supprimer ?')) { await axios.delete(`/api/clients/${clientId}/epi/${item.id}`); fetch(); } }} className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded">Supprimer</button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Aucun EPI</p>}
      </div>
      {modal !== null && (
        <GenericModal
          title={modal.id ? 'Modifier EPI' : 'Nouvel EPI'}
          fields={fields}
          initialData={modal}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.id) await axios.put(`/api/clients/${clientId}/epi/${modal.id}`, data);
            else await axios.post(`/api/clients/${clientId}/epi`, data);
            fetch();
          }}
        />
      )}
    </div>
  );
}

// ---- Logbook Tab ----
function LogbookTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);

  const fetch = useCallback(async () => {
    const res = await axios.get(`/api/clients/${clientId}/logbook`);
    setItems(res.data);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const fields = [
    { key: 'title', label: 'Titre *', required: true },
    { key: 'type', label: 'Type', type: 'select', options: [{ value: 'note', label: 'Note' }, { value: 'intervention', label: 'Intervention' }, { value: 'incident', label: 'Incident' }] },
    { key: 'entry_date', label: 'Date', type: 'datetime-local' },
    { key: 'content', label: 'Contenu', type: 'textarea' },
  ];

  const typeBadge = (type) => {
    if (type === 'intervention') return 'bg-blue-100 text-blue-700';
    if (type === 'incident') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal({ entry_date: new Date().toISOString().slice(0, 16) })} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">+ Ajouter</button>
      </div>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${typeBadge(item.type)}`}>
                    {item.type === 'intervention' ? 'Intervention' : item.type === 'incident' ? 'Incident' : 'Note'}
                  </span>
                </div>
                {item.content && <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.content}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(item.entry_date).toLocaleString('fr-FR')}
                  {item.user_name && ` · par ${item.user_name}`}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <button onClick={() => setModal({ ...item, entry_date: new Date(item.entry_date).toISOString().slice(0, 16) })} className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100">Modifier</button>
                <button onClick={async () => { if (confirm('Supprimer ?')) { await axios.delete(`/api/clients/${clientId}/logbook/${item.id}`); fetch(); } }} className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded">Supprimer</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Aucune entrée</p>}
      </div>
      {modal !== null && (
        <GenericModal
          title={modal.id ? 'Modifier entrée' : 'Nouvelle entrée'}
          fields={fields}
          initialData={modal}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.id) await axios.put(`/api/clients/${clientId}/logbook/${modal.id}`, data);
            else await axios.post(`/api/clients/${clientId}/logbook`, data);
            fetch();
          }}
        />
      )}
    </div>
  );
}

// ---- Work Orders Tab ----
const WO_STATUS_LABELS = { open: 'Ouvert', assigned: 'Assigné', in_progress: 'En cours', done: 'Terminé', cancelled: 'Annulé' };
const WO_STATUS_COLORS = {
  open: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};
const WO_PRIORITY_LABELS = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgente' };
const WO_PRIORITY_COLORS = {
  low: 'text-gray-500',
  medium: 'text-blue-600',
  high: 'text-orange-600',
  urgent: 'text-red-600 font-semibold',
};

function WorkOrdersTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [users, setUsers] = useState([]);
  const [modal, setModal] = useState(null);

  const fetch = useCallback(async () => {
    const res = await axios.get(`/api/clients/${clientId}/work-orders`);
    setItems(res.data);
  }, [clientId]);

  useEffect(() => {
    fetch();
    axios.get(`/api/clients/${clientId}/equipment`).then(res => setEquipment(res.data));
    axios.get('/api/users/assignable').then(res => setUsers(res.data));
  }, [fetch, clientId]);

  const fields = [
    { key: 'title', label: 'Titre *', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    {
      key: 'equipment_id', label: 'Équipement', type: 'select',
      options: [{ value: '', label: '—' }, ...equipment.map(e => ({ value: e.id, label: e.name }))],
    },
    {
      key: 'assigned_to', label: 'Assigné à', type: 'select',
      options: [{ value: '', label: 'Non assigné' }, ...users.map(u => ({ value: u.id, label: u.name }))],
    },
    { key: 'priority', label: 'Priorité', type: 'select', options: Object.entries(WO_PRIORITY_LABELS).map(([value, label]) => ({ value, label })) },
    { key: 'due_date', label: 'Échéance', type: 'date' },
  ];

  const editFields = modal?.id
    ? [...fields, { key: 'status', label: 'Statut', type: 'select', options: Object.entries(WO_STATUS_LABELS).map(([value, label]) => ({ value, label })) }]
    : fields;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal({ priority: 'medium' })} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">+ Nouvel ordre</button>
      </div>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${WO_STATUS_COLORS[item.status]}`}>{WO_STATUS_LABELS[item.status]}</span>
                  <span className={`text-xs ${WO_PRIORITY_COLORS[item.priority]}`}>{WO_PRIORITY_LABELS[item.priority]}</span>
                  {item.auto_generated && <span className="text-xs text-gray-400">· auto</span>}
                </div>
                {item.description && <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.description}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  {item.equipment_name && `${item.equipment_name} · `}
                  {item.assigned_to_name ? `Assigné à ${item.assigned_to_name}` : 'Non assigné'}
                  {item.due_date && ` · Échéance ${new Date(item.due_date).toLocaleDateString('fr-FR')}`}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <button onClick={() => setModal({ ...item, due_date: item.due_date ? item.due_date.slice(0, 10) : '' })} className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100">Modifier</button>
                <button onClick={async () => { if (confirm('Supprimer ?')) { await axios.delete(`/api/work-orders/${item.id}`); fetch(); } }} className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded">Supprimer</button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Aucun ordre de travail</p>}
      </div>
      {modal !== null && (
        <GenericModal
          title={modal.id ? "Modifier l'ordre de travail" : 'Nouvel ordre de travail'}
          fields={editFields}
          initialData={modal}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.id) await axios.put(`/api/work-orders/${modal.id}`, data);
            else await axios.post(`/api/clients/${clientId}/work-orders`, data);
            fetch();
          }}
        />
      )}
    </div>
  );
}

// ---- Documents Tab ----
function DocumentsTab({ clientId }) {
  const [items, setItems] = useState([]);
  const [uploading, setUploading] = useState(false);

  const fetch = useCallback(async () => {
    const res = await axios.get(`/api/clients/${clientId}/documents`);
    setItems(res.data);
  }, [clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`/api/clients/${clientId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetch();
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleOpen = async (item) => {
    try {
      const res = await axios.get(`/api/clients/${clientId}/documents/${item.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      alert('Erreur lors de l\'ouverture du document');
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <label className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {uploading ? 'Envoi...' : '+ Téléverser'}
          <input type="file" onChange={handleUpload} disabled={uploading} className="hidden" />
        </label>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-lg">📄</div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{item.original_name}</p>
                <p className="text-xs text-gray-500">
                  {formatSize(item.size)} · {new Date(item.created_at).toLocaleDateString('fr-FR')}
                  {item.uploaded_by_name && ` · ${item.uploaded_by_name}`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleOpen(item)}
                className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100 transition-colors"
              >
                Ouvrir
              </button>
              <button
                onClick={async () => {
                  if (confirm('Supprimer ce document ?')) {
                    await axios.delete(`/api/clients/${clientId}/documents/${item.id}`);
                    fetch();
                  }
                }}
                className="px-3 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-gray-400 py-8">Aucun document</p>}
      </div>
    </div>
  );
}

// ---- Main ClientDetail Page ----
const TABS = [
  { id: 'equipment', label: 'Équipements', component: EquipmentTab },
  { id: 'workorders', label: 'Ordres de travail', component: WorkOrdersTab },
  { id: 'procedures', label: 'Procédures', component: ProceduresTab },
  { id: 'passwords', label: 'Mots de passe', component: PasswordsTab },
  { id: 'contacts', label: 'Contacts', component: ContactsTab },
  { id: 'epi', label: 'EPI', component: EpiTab },
  { id: 'logbook', label: 'Journal', component: LogbookTab },
  { id: 'documents', label: 'Documents', component: DocumentsTab },
];

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [activeTab, setActiveTab] = useState('equipment');
  const [editModal, setEditModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/clients/${id}`).then(res => {
      setClient(res.data);
      setLoading(false);
    }).catch(() => navigate('/clients'));
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }

  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component;

  const clientFields = [
    { key: 'name', label: 'Nom *', required: true },
    { key: 'contract_number', label: 'N° Contrat' },
    { key: 'manager', label: 'Responsable' },
    { key: 'address', label: 'Adresse' },
    { key: 'phone', label: 'Téléphone' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6 min-w-0">
        <button onClick={() => navigate('/clients')} className="text-gray-400 hover:text-gray-600 shrink-0 text-sm">
          ← Clients
        </button>
        <span className="text-gray-300 shrink-0">/</span>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 truncate">{client.name}</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
            {client.contract_number && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">N° Contrat</p>
                <p className="text-sm font-medium text-gray-800">{client.contract_number}</p>
              </div>
            )}
            {client.manager && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Responsable</p>
                <p className="text-sm font-medium text-gray-800">{client.manager}</p>
              </div>
            )}
            {client.phone && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Téléphone</p>
                <p className="text-sm font-medium text-gray-800">{client.phone}</p>
              </div>
            )}
            {client.email && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Email</p>
                <p className="text-sm font-medium text-gray-800">{client.email}</p>
              </div>
            )}
            {client.address && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400 uppercase tracking-wider">Adresse</p>
                <p className="text-sm font-medium text-gray-800">{client.address}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setEditModal(true)}
            className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm transition-colors ml-4"
          >
            Modifier
          </button>
        </div>
        {client.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-gray-600">{client.notes}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-100">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-6">
          {ActiveComponent && <ActiveComponent clientId={id} />}
        </div>
      </div>

      {editModal && (
        <GenericModal
          title="Modifier le client"
          fields={clientFields}
          initialData={client}
          onClose={() => setEditModal(false)}
          onSave={async (data) => {
            const res = await axios.put(`/api/clients/${id}`, data);
            setClient(res.data);
          }}
        />
      )}
    </div>
  );
}
