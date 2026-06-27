'use client';
import { useEffect, useState } from 'react';
import { Card, CardBody, Button, Badge } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { isApiEnabled } from '@/lib/api/client';
import {
  listUsers, createUser, updateUser, deleteUser, resendInvite,
  STATUS_LABEL, ASSIGNABLE_ROLES, type ManagedUser, type AssignableRole,
} from '@/lib/api/users';

// Panel de gestión de usuarios del negocio (solo admin). Look del panel (--panel-*).
export function UsersPanel() {
  const apiOn = isApiEnabled();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function refresh() {
    setLoading(true); setError(null);
    try { setUsers(await listUsers()); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios'); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (apiOn) refresh(); else setLoading(false); }, [apiOn]);

  async function onToggleStatus(u: ManagedUser) {
    setBusyId(u.id); setError(null);
    try {
      await updateUser(u.id, { status: u.status === 'disabled' ? 'active' : 'disabled' });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar'); }
    finally { setBusyId(null); }
  }

  async function onChangeRole(u: ManagedUser, role: AssignableRole) {
    setBusyId(u.id); setError(null);
    try { await updateUser(u.id, { role }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar el rol'); }
    finally { setBusyId(null); }
  }

  async function onResend(u: ManagedUser) {
    setBusyId(u.id); setError(null);
    try {
      const { emailSent } = await resendInvite(u.id);
      if (!emailSent) setError('Invitación regenerada, pero el email no pudo enviarse (revisa la integración de correo).');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo reenviar'); }
    finally { setBusyId(null); }
  }

  async function onDelete(u: ManagedUser) {
    if (!confirm(`¿Eliminar a ${u.firstName} (${u.email}) de este negocio?`)) return;
    setBusyId(u.id); setError(null);
    try { await deleteUser(u.id); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo eliminar'); }
    finally { setBusyId(null); }
  }

  if (!apiOn) {
    return (
      <Card><CardBody>
        <p className="text-sm text-[var(--panel-muted)]">
          La gestión de usuarios requiere el backend conectado (define <code>NEXT_PUBLIC_API_URL</code>).
        </p>
      </CardBody></Card>
    );
  }

  return (
    <Card><CardBody className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[var(--panel-muted)]">
          Crea usuarios del negocio. Reciben un email para fijar su contraseña; nunca se envían contraseñas en claro.
        </p>
        <Button onClick={() => setModalOpen(true)}>Nuevo usuario</Button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--panel-muted)]">Cargando…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-[var(--panel-muted)]">Aún no hay usuarios.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.firstName}{u.lastName ? ` ${u.lastName}` : ''}</td>
                  <td className="text-[var(--panel-muted)]">{u.email}</td>
                  <td>
                    <select
                      className="opera-control !py-1 !h-8 w-auto"
                      value={u.role}
                      disabled={busyId === u.id}
                      onChange={(e) => onChangeRole(u, e.target.value as AssignableRole)}>
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Badge tone={u.status === 'active' ? 'green' : u.status === 'invited' ? 'amber' : 'red'}>
                      {STATUS_LABEL[u.status]}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {u.status === 'invited' && (
                        <button className="row-action edit" disabled={busyId === u.id} onClick={() => onResend(u)}>Reenviar</button>
                      )}
                      <button className="row-action edit" disabled={busyId === u.id} onClick={() => onToggleStatus(u)}>
                        {u.status === 'disabled' ? 'Activar' : 'Desactivar'}
                      </button>
                      <button className="row-action danger" disabled={busyId === u.id} onClick={() => onDelete(u)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewUserModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => { setModalOpen(false); refresh(); }} />
    </CardBody></Card>
  );
}

function NewUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<AssignableRole>('EMPLOYEE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function resetForm() { setEmail(''); setFirstName(''); setLastName(''); setRole('EMPLOYEE'); setError(null); setNotice(null); }

  async function submit() {
    setError(null); setNotice(null);
    if (!email || !firstName) { setError('Email y nombre son obligatorios.'); return; }
    setSaving(true);
    try {
      const res = await createUser({ email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim() || undefined, role });
      if (res.linked) { onCreated(); resetForm(); return; }
      if (!res.emailSent) {
        setNotice('Usuario creado, pero el email de invitación no pudo enviarse. Podrás reenviarlo desde la lista.');
        onCreated();
      } else {
        onCreated(); resetForm();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el usuario');
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} title="Nuevo usuario" onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Creando…' : 'Crear e invitar'}</Button>
        </>
      }>
      <div className="space-y-3">
        <div>
          <label className="opera-label">Email</label>
          <input className="opera-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@negocio.com" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="opera-label">Nombre</label>
            <input className="opera-control" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="opera-label">Apellidos</label>
            <input className="opera-control" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="opera-label">Rol</label>
          <select className="opera-control" value={role} onChange={(e) => setRole(e.target.value as AssignableRole)}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-amber-400">{notice}</p>}
        <p className="text-xs text-[var(--panel-muted)]">
          Se enviará un email con un enlace para que la persona fije su propia contraseña.
        </p>
      </div>
    </Modal>
  );
}
