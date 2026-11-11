import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppsPage from '@/pages/AppsPage'
import AppWorkspacePage from '@/pages/AppWorkspacePage'
import NotFoundPage from '@/pages/NotFoundPage'
import ChatScreen from '@/screens/ChatScreen'
import McpScreen from '@/screens/McpScreen'
import OverviewScreen from '@/screens/OverviewScreen'
import TodosScreen from '@/screens/TodosScreen'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppsPage />} />
        <Route path="/:appId" element={<AppWorkspacePage />}>
          <Route index element={<OverviewScreen />} />
          <Route path="chat" element={<ChatScreen />} />
          <Route path="mcp-servers" element={<McpScreen />} />
          <Route path="todos" element={<TodosScreen />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
