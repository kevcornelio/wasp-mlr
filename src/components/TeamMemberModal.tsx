import { useState, useEffect } from 'react';
import { User, Role } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TeamMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSave: (user: User) => void;
}

const emptyUser: User = { id: '', fullName: '', email: '', role: 'developer' };

export const TeamMemberModal = ({ open, onOpenChange, user, onSave }: TeamMemberModalProps) => {
  const [form, setForm] = useState<User>(emptyUser);

  useEffect(() => {
    setForm(user || emptyUser);
  }, [user, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? 'Edit Member' : 'Add Member'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="developer">Developer</SelectItem>
                <SelectItem value="designer">Designer</SelectItem>
                <SelectItem value="qa">QA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{user ? 'Update' : 'Add'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
