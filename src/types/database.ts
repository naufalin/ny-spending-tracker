export type TransactionType = "expense" | "income";

export type Household = {
  id: string;
  name: string;
  created_at: string | null;
};

export type HouseholdMember = {
  household_id: string;
  user_id: string;
  role: string;
};

export type Profile = {
  id: string;
  display_name: string;
  updated_at: string | null;
};

export type Category = {
  id: string;
  household_id: string;
  name: string;
  type: TransactionType;
};

export type Transaction = {
  id: string;
  household_id: string;
  user_id: string | null;
  category_id: string | null;
  amount: number;
  type: TransactionType;
  note: string | null;
  spent_at: string;
  created_at: string | null;
  categories?: Pick<Category, "id" | "name" | "type"> | null;
};

export type Budget = {
  id: string;
  household_id: string;
  category_id: string;
  month: string;
  amount: number;
  created_at: string | null;
  categories?: Pick<Category, "id" | "name" | "type"> | null;
};

export type Database = {
  public: {
    Tables: {
      households: {
        Row: Household;
        Insert: Omit<Household, "id" | "created_at"> & {
          id?: string;
          created_at?: string | null;
        };
        Update: Partial<Household>;
      };
      household_members: {
        Row: HouseholdMember;
        Insert: HouseholdMember;
        Update: Partial<HouseholdMember>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "updated_at"> & { updated_at?: string | null };
        Update: Partial<Profile>;
      };
      categories: {
        Row: Category;
        Insert: Omit<Category, "id"> & { id?: string };
        Update: Partial<Category>;
      };
      transactions: {
        Row: Transaction;
        Insert: Omit<Transaction, "id" | "created_at" | "categories"> & {
          id?: string;
          created_at?: string | null;
        };
        Update: Partial<Omit<Transaction, "categories">>;
      };
      budgets: {
        Row: Budget;
        Insert: Omit<Budget, "id" | "created_at" | "categories"> & {
          id?: string;
          created_at?: string | null;
        };
        Update: Partial<Omit<Budget, "categories">>;
      };
    };
  };
};
