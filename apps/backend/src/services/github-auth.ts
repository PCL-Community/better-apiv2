const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_OAUTH_BASE = 'https://github.com/login/oauth'

interface GithubAccessTokenResponse {
  access_token: string
  token_type: string
  scope: string
}

interface GithubUserProfile {
  id: number
  login: string
  name: string | null
  avatar_url: string | null
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getGithubOAuthLoginUrl(state: string): string {
  const clientId = getRequiredEnv('GITHUB_CLIENT_ID')
  const redirectUri = getRequiredEnv('GITHUB_REDIRECT_URI')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user read:org',
    state,
  })

  return `${GITHUB_OAUTH_BASE}/authorize?${params.toString()}`
}

export async function exchangeCodeForAccessToken(code: string): Promise<string> {
  const clientId = getRequiredEnv('GITHUB_CLIENT_ID')
  const clientSecret = getRequiredEnv('GITHUB_CLIENT_SECRET')
  const redirectUri = getRequiredEnv('GITHUB_REDIRECT_URI')

  const response = await fetch(`${GITHUB_OAUTH_BASE}/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to exchange GitHub code: ${response.status} ${text}`)
  }

  const data = (await response.json()) as GithubAccessTokenResponse & { error?: string }
  if (!data.access_token || data.error) {
    throw new Error(`GitHub access token error: ${data.error || 'unknown error'}`)
  }

  return data.access_token
}

export async function fetchGithubUserProfile(accessToken: string): Promise<GithubUserProfile> {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to fetch GitHub user profile: ${response.status} ${text}`)
  }

  return (await response.json()) as GithubUserProfile
}

export async function checkGithubTeamMembership(
  accessToken: string,
  login?: string,
): Promise<boolean> {
  const org = process.env.GITHUB_ORG || 'PCL-Community'
  const teamSlug = process.env.GITHUB_TEAM_SLUG || 'ce-dev'
  const username = login ?? (await fetchGithubUserProfile(accessToken)).login

  const response = await fetch(
    `${GITHUB_API_BASE}/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(teamSlug)}/memberships/${encodeURIComponent(username)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (response.status === 404) {
    return false
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to check GitHub team membership: ${response.status} ${text}`)
  }

  const membership = (await response.json()) as { state?: string }
  return membership.state === 'active'
}
