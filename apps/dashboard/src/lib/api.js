/**
 * Family Safety Network API Client
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1';

function getToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('family_access_token');
  }
  return null;
}

export function setToken(token) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('family_access_token', token);
  }
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('family_access_token');
  }
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Network request failed');
  }
  return data.data;
}

export const api = {
  // Auth
  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  register: (payload) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getMe: () => request('/auth/me'),

  // Family & Members
  getFamily: () => request('/family'),
  getMembers: () => request('/family/members'),
  getMember: (id) => request(`/family/members/${id}`),
  addMember: (payload) =>
    request('/family/members', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateMember: (id, payload) =>
    request(`/family/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteMember: (id) =>
    request(`/family/members/${id}`, {
      method: 'DELETE'
    }),

  // Pairing
  createPairingToken: (membershipId) =>
    request('/pairing/create', {
      method: 'POST',
      body: JSON.stringify({ membershipId })
    }),

  // Location & Journeys
  getMemberLocation: (id) => request(`/members/${id}/location`),
  getMemberLocations: (id) => request(`/members/${id}/locations`),
  getMemberJourneys: (id) => request(`/members/${id}/journeys`),
  getMemberTimeline: (id) => request(`/members/${id}/timeline`),

  // Alerts & SOS
  getAlerts: () => request('/alerts'),
  resolveSos: (alertId) =>
    request(`/sos/${alertId}/resolve`, {
      method: 'POST'
    }),

  // Device & Telemetry Diagnostics
  getDeviceDiagnostics: (deviceId) => request(`/devices/${deviceId}/diagnostics`),
  getMemberDiagnostics: (memberId) => request(`/devices/member/${memberId}/diagnostics`)
};
