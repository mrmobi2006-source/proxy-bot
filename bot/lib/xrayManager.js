const axios = require('axios');

class XrayManagerClient {
  constructor(internalHost, apiSecret) {
    if (!internalHost || !apiSecret) {
      throw new Error('XrayManagerClient requires internalHost and apiSecret');
    }
    this.baseUrl = `http://${internalHost}:8082`;
    this.apiSecret = apiSecret;
    this.client = axios.create({ baseURL: this.baseUrl, timeout: 5000, headers: { 'X-API-Key': this.apiSecret } });
  }

  async createClient(protocol, uuid, remark) {
    try {
      const res = await this.client.post('/clients', { protocol, uuid, remark });
      return res.data;
    } catch (err) {
      if (err.response && err.response.data) {
        throw new Error(`Xray client creation failed: ${err.response.data.error || err.response.status}`);
      }
      throw new Error(`Xray client creation failed: ${err.message}`);
    }
  }

  async deleteClient(protocol, uuid) {
    try {
      const res = await this.client.delete(`/clients/${encodeURIComponent(protocol)}/${encodeURIComponent(uuid)}`);
      return res.data;
    } catch (err) {
      if (err.response && err.response.data) {
        throw new Error(`Xray client deletion failed: ${err.response.data.error || err.response.status}`);
      }
      throw new Error(`Xray client deletion failed: ${err.message}`);
    }
  }
}

module.exports = { XrayManagerClient };
