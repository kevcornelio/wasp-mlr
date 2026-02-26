export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'none';
export type TaskStatus = 'backlog' | 'in_progress' | 'in_review' | 'done' | 'closed';
export type Role = 'admin' | 'manager' | 'developer' | 'designer' | 'qa';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  avatar?: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  members: string[]; // user ids
  deadline: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  projectId: string;
  deadline: string;
}
