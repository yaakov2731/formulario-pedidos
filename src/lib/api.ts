// Google Apps Script Web App URL
const API_URL = import.meta.env.VITE_GAS_URL || '';

export interface ApiResponse<T = any> {
  ok: boolean;
  error?: string;
  payload?: T;
  [key: string]: any;
}

export async function apiPost<T = any>(payload: Record<string, any>): Promise<ApiResponse<T>> {
  if (!API_URL) {
    console.warn('VITE_GAS_URL is not defined in .env');
    return { ok: false, error: 'API URL missing' };
  }
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('El servidor devolvió una respuesta inválida (no JSON).');
    }
    
    if (json.ok === false) {
      throw new Error(json.error || 'Error desconocido del servidor');
    }
    return json;
  } catch (err: any) {
    console.error('API Error:', err);
    throw new Error(err.message || 'Error de red al conectar con el servidor');
  }
}

export async function apiGet<T = any>(params: Record<string, string>): Promise<ApiResponse<T>> {
  if (!API_URL) return { ok: false, error: 'API URL missing' };
  
  const url = new URL(API_URL);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
    });
    
    const json = await res.json();
    return json;
  } catch (err: any) {
    console.error('API Error:', err);
    throw new Error(err.message || 'Error de red');
  }
}
