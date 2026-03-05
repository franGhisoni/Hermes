import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Newsroom from './pages/Newsroom';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Users from './pages/Users';
import Flows from './pages/Flows';
import { ScraperControl } from './components/ScraperControl';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <ScraperControl />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/newsroom/:id" element={<Newsroom />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
            <Route path="/flows" element={<Flows />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
