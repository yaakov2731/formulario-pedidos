import React, { useState } from 'react';
import { Store, User, ShoppingCart, Send } from 'lucide-react';
import { apiPost } from '../lib/api';

const LOCALES = ['Umo Grill', 'Puerto Gelato', 'Trento Café', 'Brooklyn', 'GreenFresh', 'Administración'];

export default function FormularioPedido() {
  const [local, setLocal] = useState('');
  const [encargado, setEncargado] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!local || !encargado) {
      alert("Por favor, selecciona local y encargado.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Mock API post
      await new Promise(r => setTimeout(r, 1000)); 
      // await apiPost({ action: 'savePedido', local, encargado, items: [] });
      
      alert("¡Pedido enviado con éxito!");
      setLocal('');
      setEncargado('');
    } catch (err: any) {
      alert(err.message || "Error al enviar el pedido");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Sección 1: Identificación */}
      <section className="relative bg-gradient-to-b from-[var(--color-surface)] to-[#fcfcfc] border border-[var(--color-line)] rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white bg-gradient-to-br from-brand to-brand-strong shadow-md">
            1
          </div>
          <h2 className="text-lg font-semibold text-ink m-0">¿Quién pide?</h2>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-soft flex items-center gap-1.5">
              <Store size={16} /> Local
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LOCALES.map(l => (
                <label 
                  key={l}
                  className={`
                    flex items-center justify-center text-center p-3 rounded-xl border cursor-pointer transition-all
                    ${local === l 
                      ? 'border-brand bg-brand/5 text-brand-strong shadow-[inset_0_0_0_1px_var(--color-brand)] font-semibold' 
                      : 'border-line/80 bg-white text-ink-soft hover:bg-gray-50'
                    }
                  `}
                >
                  <input 
                    type="radio" 
                    name="local" 
                    value={l} 
                    checked={local === l}
                    onChange={() => setLocal(l)}
                    className="sr-only" 
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-soft flex items-center gap-1.5">
              <User size={16} /> Encargado / Responsable
            </label>
            <input 
              type="text" 
              placeholder="Tu nombre..."
              value={encargado}
              onChange={(e) => setEncargado(e.target.value)}
              className="w-full bg-white border border-line rounded-xl px-4 py-3 text-ink shadow-inner focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
            />
          </div>
        </div>
      </section>

      {/* Sección 2: Productos (Mock) */}
      <section className="relative bg-gradient-to-b from-[var(--color-surface)] to-[#fcfcfc] border border-[var(--color-line)] rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white bg-gradient-to-br from-brand to-brand-strong shadow-md">
            2
          </div>
          <h2 className="text-lg font-semibold text-ink m-0">Insumos</h2>
        </div>
        
        <div className="text-center p-8 bg-gray-50 border border-dashed border-line rounded-xl text-ink-soft">
          <ShoppingCart className="mx-auto mb-2 opacity-50" size={32} />
          <p className="text-sm">Área de productos. En la siguiente iteración migraremos las filas dinámicas de index.html aquí.</p>
        </div>
      </section>

      {/* Submit */}
      <button 
        type="submit" 
        disabled={isSubmitting}
        className="mt-2 w-full flex items-center justify-center gap-2 bg-gradient-to-b from-brand to-brand-strong text-white font-bold text-lg py-4 px-6 rounded-xl shadow-[0_4px_12px_var(--color-brand)] disabled:opacity-70 disabled:cursor-not-allowed transition-transform active:scale-[0.98]"
      >
        {isSubmitting ? 'Enviando...' : (
          <>
            <Send size={20} />
            Enviar Pedido
          </>
        )}
      </button>
    </form>
  );
}
