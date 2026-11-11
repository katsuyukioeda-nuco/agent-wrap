import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppsPage from '@/pages/AppsPage'
import AppWorkspacePage from '@/pages/AppWorkspacePage'
import NotFoundPage from '@/pages/NotFoundPage'
import OverviewScreen from '@/screens/OverviewScreen'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppsPage />} />
        <Route path="/:appId" element={<AppWorkspacePage />}>
          <Route index element={<OverviewScreen />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
