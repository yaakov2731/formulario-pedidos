import FormularioPedido from './components/FormularioPedido';

function App() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-8 pb-32">
      {/* Header / Hero */}
      <header className="relative overflow-hidden rounded-2xl mb-6 p-5 text-white shadow-lg shadow-brand/10 bg-brand-strong">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/80 to-brand-strong mix-blend-overlay"></div>
        <div className="relative z-10 flex items-center gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-brand-strong bg-gradient-to-br from-white to-gray-100 shadow-md">
            DP
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">Pedidos · Docks del Puerto</h1>
            <p className="text-sm text-white/80 mt-0.5">Gestión operativa semanal</p>
          </div>
          
          <div className="ml-auto flex items-center gap-2 text-xs font-medium text-white/90 bg-white/10 border border-white/20 px-3 py-1.5 rounded-full backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_0_3px_rgba(74,222,128,0.3)]"></span>
            Online
          </div>
        </div>
        
        <div className="relative z-10 flex items-center gap-2 mt-4 pt-3 border-t border-white/20 text-xs font-medium tracking-wide text-white/80 uppercase">
          <span>{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
      </header>

      {/* Main Form */}
      <main>
        <FormularioPedido />
      </main>
    </div>
  );
}

export default App;
