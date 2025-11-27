import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Lobby from "./pages/Lobby.jsx";
import Game from "./pages/Game.jsx";
import DevLayout from "./components/DevLayout.jsx";

export default function App() {
  return (
    <DevLayout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lobby/:id" element={<Lobby />} />
        <Route path="/game/:id" element={<Game />} />
      </Routes>
    </DevLayout>
  );
}