/**
 * Cloudflare API client
 * Docs: https://developers.cloudflare.com/api/
 *
 * Purpose in this project: you own a domain in Cloudflare (e.g. mydomain.com).
 * For each new server the bot creates on Railway, we add a CNAME record
 * pointing a subdomain (e.g. srv1.mydomain.com) at the Railway-generated
 * domain, with Cloudflare's orange-cloud proxy ON. This gives you:
 *   - Your own branded domain instead of *.up.railway.app
 *   - Cloudflare's IPs fronting the connection (like the octopusss.net
 *     example - masks the real Railway origin, adds another CDN hop)
 *   - Free, always-on TLS via Cloudflare
 *
 * Requires: a Cloudflare API token (Zone:DNS:Edit permission) and the
 * Zone ID for your domain (found in the Cloudflare dashboard overview).
 */

const CF_API = "https://api.cloudflare.com/client/v4";

class CloudflareClient {
  constructor(apiToken, zoneId) {
    if (!apiToken || !zoneId) {
      throw new Error("CloudflareClient requires apiToken and zoneId");
    }
    this.apiToken = apiToken;
    this.zoneId = zoneId;
  }

  async _request(method, path, body) {
    const res = await fetch(`${CF_API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(
        `Cloudflare API error: ${json.errors.map((e) => e.message).join(", ")}`
      );
    }
    return json.result;
  }

  /**
   * Creates a proxied CNAME: subdomain.yourdomain.com -> target (Railway domain)
   * proxied: true means traffic routes through Cloudflare's edge (orange cloud)
   */
  async createProxiedCname(subdomain, target) {
    return this._request("POST", `/zones/${this.zoneId}/dns_records`, {
      type: "CNAME",
      name: subdomain,
      content: target,
      proxied: true,
      ttl: 1, // automatic when proxied
    });
  }

  async deleteRecord(recordId) {
    return this._request(
      "DELETE",
      `/zones/${this.zoneId}/dns_records/${recordId}`
    );
  }

  async listRecords(name) {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    return this._request("GET", `/zones/${this.zoneId}/dns_records${query}`);
  }
}

module.exports = { CloudflareClient };
