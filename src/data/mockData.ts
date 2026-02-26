import { User, Project, Task } from '@/types';

export const mockUsers: User[] = [
  { id: 'u1', fullName: 'Alex Johnson', email: 'alex@company.com', role: 'admin', avatar: '' },
  { id: 'u2', fullName: 'Sarah Chen', email: 'sarah@company.com', role: 'developer', avatar: '' },
  { id: 'u3', fullName: 'Mike Peters', email: 'mike@company.com', role: 'designer', avatar: '' },
  { id: 'u4', fullName: 'Emma Wilson', email: 'emma@company.com', role: 'manager', avatar: '' },
  { id: 'u5', fullName: 'James Lee', email: 'james@company.com', role: 'qa', avatar: '' },
];

export const mockProjects: Project[] = [
  { id: 'p1', title: 'Website Redesign', description: 'Complete overhaul of the company website with modern UI/UX', priority: 'high', members: ['u1', 'u2', 'u3'], deadline: '2026-04-15' },
  { id: 'p2', title: 'Mobile App v2', description: 'Build version 2 of the mobile application with new features', priority: 'critical', members: ['u2', 'u4'], deadline: '2026-05-01' },
  { id: 'p3', title: 'API Migration', description: 'Migrate REST APIs to GraphQL architecture', priority: 'medium', members: ['u1', 'u5'], deadline: '2026-03-30' },
];

export const mockTasks: Task[] = [
  { id: 't1', title: 'Design homepage mockup', description: 'Create high-fidelity mockups for the new homepage', status: 'done', priority: 'high', assigneeId: 'u3', projectId: 'p1', deadline: '2026-03-10' },
  { id: 't2', title: 'Set up CI/CD pipeline', description: 'Configure GitHub Actions for automated deployment', status: 'in_progress', priority: 'medium', assigneeId: 'u2', projectId: 'p1', deadline: '2026-03-15' },
  { id: 't3', title: 'User authentication flow', description: 'Implement login, signup and password reset', status: 'in_review', priority: 'critical', assigneeId: 'u2', projectId: 'p2', deadline: '2026-03-08' },
  { id: 't4', title: 'Database schema design', description: 'Design the database schema for the new features', status: 'backlog', priority: 'high', assigneeId: 'u1', projectId: 'p3', deadline: '2026-03-20' },
  { id: 't5', title: 'Write unit tests', description: 'Add comprehensive unit tests for core modules', status: 'backlog', priority: 'low', assigneeId: 'u5', projectId: 'p3', deadline: '2026-04-01' },
  { id: 't6', title: 'Performance optimization', description: 'Optimize bundle size and loading times', status: 'in_progress', priority: 'medium', assigneeId: 'u2', projectId: 'p1', deadline: '2026-03-18' },
  { id: 't7', title: 'Push notifications', description: 'Implement push notification system', status: 'backlog', priority: 'high', assigneeId: 'u4', projectId: 'p2', deadline: '2026-04-10' },
  { id: 't8', title: 'Legacy API deprecation', description: 'Mark and document deprecated endpoints', status: 'closed', priority: 'low', assigneeId: 'u1', projectId: 'p3', deadline: '2026-02-28' },
  { id: 't9', title: 'Responsive navigation', description: 'Fix mobile navigation issues', status: 'in_review', priority: 'medium', assigneeId: 'u3', projectId: 'p1', deadline: '2026-03-12' },
  { id: 't10', title: 'Dark mode support', description: 'Add dark mode toggle and theme switching', status: 'done', priority: 'low', assigneeId: 'u3', projectId: 'p1', deadline: '2026-03-05' },
];
