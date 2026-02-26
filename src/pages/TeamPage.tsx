import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { User, Role } from '@/types';
import { TeamMemberModal } from '@/components/TeamMemberModal';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Mail } from 'lucide-react';

const roleLabels: Record<Role, string> = {
  admin: 'Admin', manager: 'Manager', developer: 'Developer', designer: 'Designer', qa: 'QA',
};

const TeamPage = () => {
  const { users, setUsers } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const handleSave = (user: User) => {
    if (editing) {
      setUsers(prev => prev.map(u => u.id === user.id ? user : u));
    } else {
      setUsers(prev => [...prev, { ...user, id: `u-${Date.now()}` }]);
    }
    setModalOpen(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => setUsers(prev => prev.filter(u => u.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Team</h1>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Member
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Name</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 hidden sm:table-cell">Email</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Role</th>
              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                      {user.fullName.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="text-sm font-medium text-foreground">{user.fullName}</span>
                  </div>
                </td>
                <td className="px-5 py-3 hidden sm:table-cell">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Mail className="h-3 w-3" /> {user.email}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs font-medium bg-secondary text-secondary-foreground px-2 py-1 rounded">
                    {roleLabels[user.role]}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => { setEditing(user); setModalOpen(true); }} className="p-1.5 rounded hover:bg-accent">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(user.id)} className="p-1.5 rounded hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TeamMemberModal open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setEditing(null); }} user={editing} onSave={handleSave} />
    </div>
  );
};

export default TeamPage;
