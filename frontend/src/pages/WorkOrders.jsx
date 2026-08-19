import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const STATUS_LABELS = { open: 'Ouvert', assigned: 'Assigné', in_progress: 'En cours', done: 'Terminé', cancelled: 'Annulé' };
const STATUS_ORDER = ['open', 'assigned', 'in_progress', 'done', 'cancelled'];
const STATUS_COLORS = {
  open: 'border-gray-300',
  assigned: 'border-blue-300',
  in_progress: 'border-amber-300',
  done: 'border-green-300',
  cancelled: 'border-red-300',
};
const PRIORITY_LABELS = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgente' };
const PRIORITY_COLORS = { low: 'text-gray-500', medium: 'text-blue-600', high: 'text-orange-600', urgent: 'text-red-600 font-semibold' };

function NewWorkOrderModal({ clients, users, onClose, onCreated }) {
  const [form, setForm] = useState({ priority: 'medium', client_id: clients[0]?.id || '' });
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!form.client_id) return;
    axios.get(`/api/clients/${form.client_id}/equipment`).then(res => setEquipment(res.data));
  }, [form.client_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.client_id || !form.title) return;
    setLoading(true);
    setError('');
    try {
      await axios.post(`/api/clients/${form.client_id}/work-orders`, form);
      onCreated();
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
          <h3 className="text-lg font-semibold text-gray-800">Nouvel ordre de travail</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6 space-y-4">
          {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select
              value={form.client_id}
              onChange={e => setForm(f => ({ ...f, client_id: e.target.value, equipment_id: '' }))}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input
              value={form.title || ''}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description || ''}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Équipement</label>
              <select
                value={form.equipment_id || ''}
                onChange={e => setForm(f => ({ ...f, equipment_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">—</option>
                {equipment.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigné à</label>
              <select
                value={form.assigned_to || ''}
                onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Non assigné</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorité</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Échéance</label>
              <input
                type="date"
                value={form.due_date || ''}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">Annuler</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
              {loading ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WorkOrders() {
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [showNew, setShowNew] = useState(false);

  const fetchItems = useCallback(async () => {
    const params = {};
    if (filterAssignee) params.assigned_to = filterAssignee;
    const res = await axios.get('/api/work-orders', { params });
    setItems(res.data);
  }, [filterAssignee]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => {
    axios.get('/api/clients').then(res => setClients(res.data));
    axios.get('/api/users/assignable').then(res => setUsers(res.data));
  }, []);

  const updateStatus = async (item, status) => {
    await axios.put(`/api/work-orders/${item.id}`, {
      title: item.title,
      description: item.description,
      priority: item.priority,
      equipment_id: item.equipment_id,
      assigned_to: item.assigned_to,
      due_date: item.due_date ? item.due_date.slice(0, 10) : '',
      status,
    });
    fetchItems();
  };

  const grouped = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: items.filter(i => i.status === s) }), {});

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Ordres de travail</h1>
        <div className="flex items-center gap-3">
          <select
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Tous les techniciens</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">+ Nouvel ordre</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {STATUS_ORDER.map(status => (
          <div key={status} className={`bg-gray-50 rounded-xl border-t-4 ${STATUS_COLORS[status]} p-3 min-h-[200px]`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center justify-between">
              {STATUS_LABELS[status]}
              <span className="text-xs font-normal text-gray-400">{grouped[status].length}</span>
            </h3>
            <div className="space-y-2">
              {grouped[status].map(item => (
                <div key={item.id} className="bg-white rounded-lg border border-gray-100 p-3 shadow-sm">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <Link to={`/clients/${item.client_id}`} className="text-xs text-blue-500 hover:underline">{item.client_name}</Link>
                  <p className={`text-xs mt-1 ${PRIORITY_COLORS[item.priority]}`}>{PRIORITY_LABELS[item.priority]}</p>
                  {item.assigned_to_name && <p className="text-xs text-gray-500">👤 {item.assigned_to_name}</p>}
                  {item.due_date && <p className="text-xs text-gray-400">📅 {new Date(item.due_date).toLocaleDateString('fr-FR')}</p>}
                  <select
                    value={item.status}
                    onChange={e => updateStatus(item, e.target.value)}
                    className="w-full mt-2 px-2 py-1 border border-gray-200 rounded text-xs"
                  >
                    {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              ))}
              {grouped[status].length === 0 && <p className="text-xs text-gray-300 text-center py-4">—</p>}
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <NewWorkOrderModal
          clients={clients}
          users={users}
          onClose={() => setShowNew(false)}
          onCreated={fetchItems}
        />
      )}
    </div>
  );
}
