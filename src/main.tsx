import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router'
import App from './App.tsx'
import Login from './pages/Login.tsx'
import MyProfile from './pages/MyProfile.tsx'
import ProtectedRoute from './components/ProtectedRoute.tsx'
import { Chat } from './pages/chat.tsx'

const router = createHashRouter([
	{
		path: '/',
		Component: App,
		children: [
			{
			index: true,
			Component: Login
			},
			{
				path: '/my-profile',
				element: <ProtectedRoute><MyProfile /></ProtectedRoute>
			},
			{
				path: '/chat',
				element: <ProtectedRoute><Chat /></ProtectedRoute>
			}
		]
	}
])
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router}/>
  </StrictMode>,
)