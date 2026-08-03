const axios = require('axios');

class SshManagerClient {
  constructor(internalHost, apiSecret) {
    if (!internalHost || !apiSecret) {
      throw new Error('SshManagerClient requires internalHost and apiSecret');
    }
    this.baseUrl = `http://${internalHost}:8081`;
    this.apiSecret = apiSecret;
    this.client = axios.create({ baseURL: this.baseUrl, timeout: 5000, headers: { 'X-API-Key': this.apiSecret } });
  }

  async createUser(username, password) {
    try {
      const res = await this.client.post('/users', { username, password });
      return res.data;
    } catch (err) {
      if (err.response && err.response.data) {
        throw new Error(`SSH user creation failed: ${err.response.data.error || err.response.status}`);
      }
      throw new Error(`SSH user creation failed: ${err.message}`);
    }
  }

  async deleteUser(username) {
    try {
      const res = await this.client.delete(`/users/${encodeURIComponent(username)}`);
      return res.data;
    } catch (err) {
      if (err.response && err.response.data) {
        throw new Error(`SSH user deletion failed: ${err.response.data.error || err.response.status}`);
      }
      throw new Error(`SSH user deletion failed: ${err.message}`);
    }
  }
}

module.exports = { SshManagerClient };
