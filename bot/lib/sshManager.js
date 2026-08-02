class SshManagerClient {
  constructor(internalHost, apiSecret) {
    if (!internalHost || !apiSecret) {
      throw new Error("SshManagerClient requires internalHost and apiSecret");
    }
    this.baseUrl = `http://${internalHost}:8081`;
    this.apiSecret = apiSecret;
  }

  async createUser(username, password) {
    const res = await fetch(`${this.baseUrl}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": this.apiSecret },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`SSH user creation failed: ${data.error || res.status}`);
    return data;
  }

  async deleteUser(username) {
    const res = await fetch(`${this.baseUrl}/users/${username}`, {
      method: "DELETE",
      headers: { "X-API-Key": this.apiSecret },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`SSH user deletion failed: ${data.error || res.status}`);
    return data;
  }
}

module.exports = { SshManagerClient };
