import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Newsroom from './pages/Newsroom';
import Settings from './pages/Settings';
import { ScraperControl } from './components/ScraperControl';

function App() {
  return (
    <Router>
      <ScraperControl />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/newsroom/:id" element={<Newsroom />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Router>
  );
}

export default App;
