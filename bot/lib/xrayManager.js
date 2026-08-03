const axios = require("axios");

class XrayManagerClient {
  constructor(internalHost, apiSecret) {
    if (!internalHost || !apiSecret) {
      throw new Error("XrayManagerClient requires internalHost and apiSecret");
    }
    this.baseUrl = `http://${internalHost}:8082`;
    this.apiSecret = apiSecret;
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiSecret,
      },
      timeout: 10000,
    });
  }

  async createClient(protocol, uuid, remark) {
    try {
      const payload = {
        protocol: protocol.toLowerCase(),
        uuid: uuid,
        remark: remark,
      };

      const response = await this.axiosInstance.post("/clients", payload);
      
      if (response.status >= 200 && response.status < 300) {
        return response.data;
      }
      throw new Error(`Failed with status ${response.status}`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      throw new Error(`❌ خطأ في إنشاء ${protocol.toUpperCase()}: ${errorMsg}`);
    }
  }

  async deleteClient(protocol, uuid) {
    try {
      const response = await this.axiosInstance.delete(
        `/clients/${protocol.toLowerCase()}/${uuid}`
      );
      
      if (response.status >= 200 && response.status < 300) {
        return response.data;
      }
      throw new Error(`Failed with status ${response.status}`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      throw new Error(`❌ خطأ في حذف ${protocol.toUpperCase()}: ${errorMsg}`);
    }
  }

  async listClients() {
    try {
      const response = await this.axiosInstance.get("/clients");
      return response.data;
    } catch (err) {
      throw new Error(`Failed to list clients: ${err.message}`);
    }
  }

  async getHealth() {
    try {
      const response = await this.axiosInstance.get("/health");
      return response.data;
    } catch (err) {
      throw new Error(`Xray service unreachable: ${err.message}`);
    }
  }
}

module.exports = { XrayManagerClient };
