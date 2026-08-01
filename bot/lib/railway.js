/**
 * Railway API client
 * Docs: https://docs.railway.com/reference/public-api
 *
 * Requires a Railway API token with access to the target project.
 * Generate one at: https://railway.app/account/tokens
 */

const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

class RailwayClient {
  constructor(apiToken, projectId, environmentId) {
    if (!apiToken || !projectId || !environmentId) {
      throw new Error(
        "RailwayClient requires apiToken, projectId, and environmentId"
      );
    }
    this.apiToken = apiToken;
    this.projectId = projectId;
    this.environmentId = environmentId;
  }

  async _request(query, variables) {
    const res = await fetch(RAILWAY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = await res.json();
    if (json.errors) {
      throw new Error(
        `Railway API error: ${json.errors.map((e) => e.message).join(", ")}`
      );
    }
    return json.data;
  }

  /**
   * Creates a new service in the project from a public Docker image
   * (e.g. an image you've pushed to Docker Hub / GHCR built from
   * docker/xray or docker/ssh in this repo).
   */
  async createServiceFromImage(name, imageName) {
    const query = `
      mutation ServiceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
        }
      }
    `;
    const variables = {
      input: {
        projectId: this.projectId,
        name,
        source: { image: imageName },
      },
    };
    const data = await this._request(query, variables);
    return data.serviceCreate;
  }

  /**
   * Sets environment variables for a service in a given environment.
   * vars: { KEY: "value", ... }
   */
  async setVariables(serviceId, vars) {
    const query = `
      mutation VariableCollectionUpsert($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `;
    const variables = {
      input: {
        projectId: this.projectId,
        environmentId: this.environmentId,
        serviceId,
        variables: vars,
      },
    };
    return this._request(query, variables);
  }

  /**
   * Triggers a deploy for the service in this environment.
   */
  async deployService(serviceId) {
    const query = `
      mutation ServiceInstanceDeploy($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
      }
    `;
    return this._request(query, { serviceId, environmentId: this.environmentId });
  }

  /**
   * Generates a public HTTP domain (*.up.railway.app) for the service.
   * Used for VLESS/VMess over WebSocket+TLS - Railway terminates TLS for you.
   */
  async createDomain(serviceId, targetPort) {
    const query = `
      mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          domain
        }
      }
    `;
    const variables = {
      input: {
        environmentId: this.environmentId,
        serviceId,
        targetPort,
      },
    };
    const data = await this._request(query, variables);
    return data.serviceDomainCreate.domain;
  }

  /**
   * Creates a TCP proxy for services that need raw TCP (SSH).
   * Railway assigns a random public port on a shared hostname.
   */
  async createTcpProxy(serviceId, targetPort) {
    const query = `
      mutation TcpProxyCreate($input: TCPProxyCreateInput!) {
        tcpProxyCreate(input: $input) {
          domain
          proxyPort
        }
      }
    `;
    const variables = {
      input: {
        environmentId: this.environmentId,
        serviceId,
        applicationPort: targetPort,
      },
    };
    const data = await this._request(query, variables);
    return data.tcpProxyCreate; // { domain, proxyPort }
  }

  /**
   * Deletes a service entirely (used for expiring/cancelled servers).
   */
  async deleteService(serviceId) {
    const query = `
      mutation ServiceDelete($id: String!) {
        serviceDelete(id: $id)
      }
    `;
    return this._request(query, { id: serviceId });
  }
}

module.exports = { RailwayClient };
