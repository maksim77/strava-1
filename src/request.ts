import 'isomorphic-fetch'

import { StravaError } from './errors'
import { RefreshTokenRequest, RefreshTokenResponse } from './types'

type RequestParams = {
  query?: Record<string, unknown>
  body?: Record<string, unknown>
}

export class Request {
  config: RefreshTokenRequest
  response: RefreshTokenResponse

  constructor(config: RefreshTokenRequest) {
    this.config = config
  }

  private async getAccessToken(): Promise<RefreshTokenResponse> {
    if (
      !this.response ||
      this.response?.expires_at < new Date().getTime() / 1000
    ) {
      const query: string = new URLSearchParams({
        client_id: this.config.client_id,
        client_secret: this.config.client_secret,
        refresh_token: this.config.refresh_token,
        grant_type: 'refresh_token',
      }).toString()

      const response = await fetch(
        `https://www.strava.com/oauth/token?${query}`,
        {
          method: 'post',
        },
      )

      if (!response.ok) {
        throw response
      }

      this.response = (await response.json()) as RefreshTokenResponse
    }
    return this.response
  }

  public async makeApiRequest<Response>(
    method: string,
    uri: string,
    params?: RequestParams,
  ): Promise<Response> {
    try {
      await this.getAccessToken()
      const query: string = new URLSearchParams(
        Object.entries(params).reduce(
          (acc, [key, value]) => ({ ...acc, [key]: String(value) }),
          {},
        ),
      ).toString()
      const response = await fetch(
        `https://www.strava.com/api/v3${uri}?${query}`,
        {
          body: JSON.stringify(params?.body),
          method,
          headers: {
            Authorization: `Bearer ${this.response.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (!response.ok) {
        throw response
      }

      if (response.status !== 204) {
        return (await response.json()) as Promise<Response>
      }
    } catch (error) {
      const data = (await error.json()) as Record<string, string>
      switch (error.status) {
        case 400:
        case 401:
        case 403:
        case 404:
        case 429:
        case 500:
          throw new StravaError(error, data)
        default:
          throw error
      }
    }
  }
}
