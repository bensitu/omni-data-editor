export interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
  office: string;
  salary: number;
  status: string;
}

export const offices = [
  'Amsterdam',
  'Berlin',
  'Copenhagen',
  'London',
  'New York',
  'Paris',
  'Singapore',
  'Tokyo',
];

export const initialMembers: readonly Member[] = [
  {
    id: 1,
    name: 'Olivia Rhye',
    email: 'olivia@example.com',
    role: 'Product Designer',
    department: 'Design',
    office: 'London',
    salary: 108000,
    status: 'Active',
  },
  {
    id: 2,
    name: 'Phoenix Baker',
    email: 'phoenix@example.com',
    role: 'Engineering Lead',
    department: 'Engineering',
    office: 'Berlin',
    salary: 142000,
    status: 'Active',
  },
  {
    id: 3,
    name: 'Lana Steiner',
    email: 'lana@example.com',
    role: 'Brand Designer',
    department: 'Design',
    office: 'Amsterdam',
    salary: 96000,
    status: 'On leave',
  },
  {
    id: 4,
    name: 'Demi Wilkinson',
    email: 'demi@example.com',
    role: 'Growth Marketer',
    department: 'Marketing',
    office: 'New York',
    salary: 104000,
    status: 'Active',
  },
  {
    id: 5,
    name: 'Drew Cano',
    email: 'drew@example.com',
    role: 'Frontend Engineer',
    department: 'Engineering',
    office: 'London',
    salary: 128000,
    status: 'Active',
  },
  {
    id: 6,
    name: 'Natali Craig',
    email: 'natali@example.com',
    role: 'People Partner',
    department: 'Operations',
    office: 'Copenhagen',
    salary: 92000,
    status: 'Active',
  },
  {
    id: 7,
    name: 'Orlando Diggs',
    email: 'orlando@example.com',
    role: 'Content Strategist',
    department: 'Marketing',
    office: 'Paris',
    salary: 88000,
    status: 'On leave',
  },
  {
    id: 8,
    name: 'Andi Lane',
    email: 'andi@example.com',
    role: 'Operations Lead',
    department: 'Operations',
    office: 'Tokyo',
    salary: 112000,
    status: 'Active',
  },
];
