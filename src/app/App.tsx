import { Route, Switch } from 'wouter'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { AccountEditPage } from '../features/settings/AccountEditPage'
import { AccountsPage } from '../features/settings/AccountsPage'
import { CategoriesPage } from '../features/settings/CategoriesPage'
import { CategoryEditPage } from '../features/settings/CategoryEditPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TransactionFormPage } from '../features/transactions/TransactionFormPage'
import { TransactionsPage } from '../features/transactions/TransactionsPage'
import { Layout } from './Layout'

export function App() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/transactions" component={TransactionsPage} />
        <Route path="/add" component={TransactionFormPage} />
        <Route path="/transactions/:id" component={TransactionFormPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/settings/categories" component={CategoriesPage} />
        <Route path="/settings/categories/:id" component={CategoryEditPage} />
        <Route path="/settings/accounts" component={AccountsPage} />
        <Route path="/settings/accounts/:id" component={AccountEditPage} />
        <Route>
          <p className="py-16 text-center text-muted">Page not found.</p>
        </Route>
      </Switch>
    </Layout>
  )
}
