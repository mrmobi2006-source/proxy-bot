class XrayManagerClient {
  constructor(internalHost, apiSecret) {
    if (!internalHost || !apiSecret) {
      throw new Error("XrayManagerClient requires internalHost and apiSecret");
    }
    this.baseUrl = `http://${internalHost}:8082`;
    this.apiSecret = apiSecret;
  }

  async createClient(protocol, uuid, remark) {
    const res = await fetch(`${this.baseUrl}/clients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiSecret,
      },
      body: JSON.stringify({ protocol, uuid, remark }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Xray client creation failed: ${data.error || res.status}`);
    }
    return data;
  }

  async deleteClient(protocol, uuid) {
    const res = await fetch(`${this.baseUrl}/clients/${protocol}/${uuid}`, {
      method: "DELETE",
      headers: { "X-API-Key": this.apiSecret },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Xray client deletion failed: ${data.error || res.status}`);
    }
    return data;
  }
}

module.exports = { XrayManagerClient };
