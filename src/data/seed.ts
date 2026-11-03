import type { Transaction as DexieTransaction } from 'dexie'
import { accountSchema, categorySchema, type Account, type Category } from '../domain/types'

/**
 * Seed rows use fixed IDs so the iPhone and the Mac create identical defaults,
 * and a later merge-sync doesn't end up with two "Food & Dining" categories.
 */
type SeedCategory = Pick<Category, 'id' | 'name' | 'type' | 'icon' | 'color' | 'keywords'>
type SeedAccount = Pick<Account, 'id' | 'name' | 'type' | 'aliases' | 'isDefault'>

// prettier-ignore
export const SEED_CATEGORIES: SeedCategory[] = [
  { id: 'cat-food', name: 'Food & Dining', type: 'expense', icon: '🍽️', color: '#e8590c', keywords: ['lunch', 'dinner', 'breakfast', 'food', 'restaurant', 'cafe', 'coffee', 'tea', 'snacks', 'swiggy', 'zomato'] },
  { id: 'cat-groceries', name: 'Groceries', type: 'expense', icon: '🛒', color: '#2f9e44', keywords: ['groceries', 'grocery', 'vegetables', 'fruits', 'milk', 'blinkit', 'zepto', 'bigbasket', 'instamart', 'dmart'] },
  { id: 'cat-transport', name: 'Transport', type: 'expense', icon: '🚕', color: '#1971c2', keywords: ['uber', 'ola', 'rapido', 'auto', 'cab', 'taxi', 'metro', 'bus', 'train', 'parking', 'toll'] },
  { id: 'cat-fuel', name: 'Fuel', type: 'expense', icon: '⛽', color: '#5f3dc4', keywords: ['petrol', 'diesel', 'fuel', 'cng'] },
  { id: 'cat-shopping', name: 'Shopping', type: 'expense', icon: '🛍️', color: '#c2255c', keywords: ['shopping', 'amazon', 'flipkart', 'myntra', 'clothes', 'shoes'] },
  { id: 'cat-entertainment', name: 'Entertainment', type: 'expense', icon: '🎬', color: '#9c36b5', keywords: ['movie', 'movies', 'concert', 'game', 'games', 'bookmyshow'] },
  { id: 'cat-health', name: 'Health', type: 'expense', icon: '💊', color: '#e03131', keywords: ['medicine', 'medicines', 'doctor', 'pharmacy', 'hospital', 'medical', 'pharmeasy'] },
  { id: 'cat-fitness', name: 'Fitness', type: 'expense', icon: '🏋️', color: '#0c8599', keywords: ['gym', 'yoga', 'fitness'] },
  { id: 'cat-travel', name: 'Travel', type: 'expense', icon: '✈️', color: '#1098ad', keywords: ['flight', 'hotel', 'travel', 'trip', 'airbnb', 'irctc'] },
  { id: 'cat-bills', name: 'Bills & Utilities', type: 'expense', icon: '💡', color: '#f08c00', keywords: ['electricity', 'water', 'gas', 'internet', 'wifi', 'broadband', 'recharge', 'bill'] },
  { id: 'cat-rent', name: 'Rent', type: 'expense', icon: '🏠', color: '#495057', keywords: ['rent'] },
  { id: 'cat-subscriptions', name: 'Subscriptions', type: 'expense', icon: '🔁', color: '#3b5bdb', keywords: ['subscription', 'netflix', 'spotify', 'prime', 'hotstar', 'youtube', 'icloud'] },
  { id: 'cat-education', name: 'Education', type: 'expense', icon: '📚', color: '#5c940d', keywords: ['course', 'books', 'book', 'tuition', 'udemy'] },
  { id: 'cat-personal-care', name: 'Personal Care', type: 'expense', icon: '💇', color: '#d6336c', keywords: ['haircut', 'salon', 'spa', 'grooming'] },
  { id: 'cat-misc', name: 'Miscellaneous', type: 'expense', icon: '📦', color: '#868e96', keywords: [] },
  { id: 'cat-salary', name: 'Salary', type: 'income', icon: '💼', color: '#2b8a3e', keywords: ['salary', 'payroll'] },
  { id: 'cat-freelance', name: 'Freelance', type: 'income', icon: '🧑‍💻', color: '#1864ab', keywords: ['freelance', 'client'] },
  { id: 'cat-investments', name: 'Investments', type: 'income', icon: '📈', color: '#087f5b', keywords: ['dividend', 'interest', 'investment', 'investments'] },
  { id: 'cat-refunds', name: 'Refunds', type: 'income', icon: '↩️', color: '#5f3dc4', keywords: ['refund', 'cashback', 'reversal'] },
  { id: 'cat-other-income', name: 'Other Income', type: 'income', icon: '💰', color: '#868e96', keywords: ['gift'] },
]

// prettier-ignore
export const SEED_ACCOUNTS: SeedAccount[] = [
  { id: 'acc-cash', name: 'Cash', type: 'cash', aliases: ['cash'], isDefault: false },
  { id: 'acc-hdfc', name: 'HDFC Bank', type: 'bank', aliases: ['hdfc', 'hdfc bank'], isDefault: true },
  { id: 'acc-other-bank', name: 'Other Bank', type: 'bank', aliases: ['other bank'], isDefault: false },
  { id: 'acc-credit-card', name: 'Credit Card', type: 'credit_card', aliases: ['credit card', 'card'], isDefault: false },
]

/**
 * Defaults are stamped with a fixed, old time. If the device's storage is ever wiped and the
 * defaults are recreated, any edit in a backup is newer and wins when it's merged back.
 */
export const SEED_TIMESTAMP = '2000-01-01T00:00:00.000Z'

export async function seedDatabase(tx: DexieTransaction): Promise<void> {
  const now = SEED_TIMESTAMP
  const categories = SEED_CATEGORIES.map((c) =>
    categorySchema.parse({ ...c, archived: false, createdAt: now, updatedAt: now }),
  )
  const accounts = SEED_ACCOUNTS.map((a) =>
    accountSchema.parse({
      ...a,
      openingBalance: 0,
      currency: 'INR',
      archived: false,
      createdAt: now,
      updatedAt: now,
    }),
  )
  await tx.table('categories').bulkAdd(categories)
  await tx.table('accounts').bulkAdd(accounts)
}
