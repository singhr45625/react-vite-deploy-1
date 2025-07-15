import { Suspense, lazy, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthContext } from "./context/AuthContext";
import "./style.scss";

// Lazy-loaded components
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));

function App() {
  const { currentUser } = useContext(AuthContext);

  const ProtectedRoute = ({ children }) => {
    if (!currentUser) {
      return <Navigate to="/login" />;
    }
    return children;
  };

  // Loading component (shown during lazy loading)
  const Loading = () => <div className="loading">Loading...</div>;

  return (
    <BrowserRouter basename="/chat_app">
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/">
            <Route
              index
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            {/* Add catch-all route for GitHub Pages */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;