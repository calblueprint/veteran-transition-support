import { Database } from './database.types';

// utility types
export type PublicTables = Database['public']['Tables'];
export type PublicTable<T extends keyof PublicTables> = PublicTables[T]['Row'];

// types derived from database-generated types
export type Profile = PublicTable<'user_profiles'>;
