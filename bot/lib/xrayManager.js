class XrayManagerClient {
  constructor(internalHost, apiSecret) {
    if (!internalHost || !apiSecret) throw new Error("XrayManagerClient: missing host or secret");
    this.base   = `http://${internalHost}:8082`;
    this.secret = apiSecret;
  }

  async _req(method, path, body) {
    const opts = { method, headers: { "Content-Type": "application/json", "X-API-Key": this.secret } };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(`${this.base}${path}`, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || String(res.status));
    return data;
  }

  async createClient(protocol, uuid, remark, email) {
    return this._req("POST", "/clients", { protocol, uuid, remark, email });
  }

  async deleteClient(protocol, uuid) {
    return this._req("DELETE", `/clients/${protocol}/${uuid}`);
  }

  async getStats(email) {
    try {
      const data = await this._req("GET", `/stats/${encodeURIComponent(email)}`);
      return { up: data.up || 0, down: data.down || 0 };
    } catch {
      return { up: 0, down: 0 };
    }
  }
}

module.exports = { XrayManagerClient };
