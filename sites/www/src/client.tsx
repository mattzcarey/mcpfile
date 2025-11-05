import "./styles.css";
import "fumadocs-ui/style.css";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet } from "react-router";
import { RouterProvider } from "react-router/dom";
import { RootProvider } from "fumadocs-ui/provider/react-router";
import { HomePage } from "./pages/home";
import { DocsPage } from "./pages/docs";
import SearchDialog from "./components/search";

function Layout() {
  return (
    <RootProvider search={{ SearchDialog }}>
      <Outlet />
    </RootProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <HomePage />,
      },
      {
        path: "/docs/*",
        element: <DocsPage />,
      },
    ],
  },
]);

const root = createRoot(document.getElementById("root")!);
root.render(<RouterProvider router={router} />);
