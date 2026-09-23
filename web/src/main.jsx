import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Tradução do browser (Google Tradutor): o tradutor troca os textos da página por elementos seus, e o React,
// ao atualizar a página de segundo em segundo, tentava mexer em nós que já lá não estavam e a página rebentava.
// Estas duas proteções fazem o React ignorar esses nós em vez de parar.
if (typeof Node === "function" && Node.prototype) {
  const remover = Node.prototype.removeChild;
  Node.prototype.removeChild = function (filho) {
    if (filho.parentNode !== this) return filho;
    return remover.call(this, filho);
  };
  const inserir = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (novo, ref) {
    if (ref && ref.parentNode !== this) return inserir.call(this, novo, null);
    return inserir.call(this, novo, ref);
  };
}

createRoot(document.getElementById("root")).render(<App />);
