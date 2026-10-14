import gql from "graphql-tag";
import getGraphqlClient from "~/graphql/getGraphqlClient";

/**
 * DEAFCS-only News comments (5Stack has none). Reads go straight to Hasura
 * (news_comments, news_comment_votes); every write is an API action that
 * applies the rules Anders approved on 2026-10-14: Verified Users and above,
 * 10-minute edits, reply notifications, and a thread that is open for the
 * first 7 days after publication.
 *
 * Plain gql documents rather than the generated Zeus client: these tables are
 * new, so they only reach generated/zeus at the next codegen after the
 * migration is applied.
 */

export const NEWS_COMMENTS_PAGE = 20;
export const NEWS_COMMENT_MAX_LENGTH = 2000;
export const NEWS_COMMENT_EDIT_MINUTES = 10;
export const NEWS_COMMENTS_OPEN_DAYS = 7;

export interface NewsCommentTeam {
  id: string;
  name: string;
  short_name: string | null;
  avatar_url: string | null;
}

export interface NewsCommentAuthor {
  steam_id: string;
  name: string;
  avatar_url: string | null;
  custom_avatar_url: string | null;
  country: string | null;
  team_members: Array<{ team: NewsCommentTeam | null }>;
}

export interface NewsComment {
  id: string;
  parent_id: string | null;
  author_steam_id: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  hidden_at: string | null;
  hidden_reason?: string | null;
  vote_count: number;
  text: string | null;
  author: NewsCommentAuthor | null;
  votes?: Array<{ steam_id: string }>;
  replies?: NewsComment[];
}

/** A thread is open for the first 7 days after the article is published. */
export function newsCommentsOpen(
  publishedAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!publishedAt) {
    return false;
  }
  return (
    now <
    new Date(publishedAt).getTime() + NEWS_COMMENTS_OPEN_DAYS * 86_400_000
  );
}

/** Own comments can be edited for 10 minutes after posting. */
export function newsCommentEditable(
  comment: Pick<NewsComment, "created_at" | "deleted_at" | "hidden_at">,
  now = Date.now(),
): boolean {
  return (
    !comment.deleted_at &&
    !comment.hidden_at &&
    now <
      new Date(comment.created_at).getTime() +
        NEWS_COMMENT_EDIT_MINUTES * 60_000
  );
}

/**
 * The team shown beside a name: only when the player is on exactly one team
 * as a Starter or Substitute. Several teams, or none, shows no logo rather
 * than picking one.
 */
export function newsCommentTeam(
  author: NewsCommentAuthor | null | undefined,
): NewsCommentTeam | null {
  const teams = new Map<string, NewsCommentTeam>();
  for (const member of author?.team_members ?? []) {
    if (member.team) {
      teams.set(member.team.id, member.team);
    }
  }
  return teams.size === 1 ? [...teams.values()][0] : null;
}

const authorFields = `
  steam_id
  name
  avatar_url
  custom_avatar_url
  country
  team_members(where: { status: { _neq: Benched } }) {
    team { id name short_name avatar_url }
  }
`;

// Only the fields a role is allowed to select: guests have no access to
// votes, and only staff see why a comment was hidden.
function commentFields(options: { signedIn: boolean; staff: boolean }) {
  return `
    id
    parent_id
    author_steam_id
    created_at
    edited_at
    deleted_at
    hidden_at
    vote_count
    text
    ${options.staff ? "hidden_reason" : ""}
    ${options.signedIn ? "votes { steam_id }" : ""}
    author { ${authorFields} }
  `;
}

function threadQuery(options: { signedIn: boolean; staff: boolean }) {
  const fields = commentFields(options);
  return gql`
    query NewsCommentThread($article: uuid!, $limit: Int!, $offset: Int!) {
      news_comments(
        where: { article_id: { _eq: $article }, parent_id: { _is_null: true } }
        order_by: { created_at: asc }
        limit: $limit
        offset: $offset
      ) {
        ${fields}
        replies(order_by: { created_at: asc }) { ${fields} }
      }
      threads: news_comments_aggregate(
        where: { article_id: { _eq: $article }, parent_id: { _is_null: true } }
      ) {
        aggregate { count }
      }
      visible: news_comments_aggregate(
        where: {
          article_id: { _eq: $article }
          deleted_at: { _is_null: true }
          hidden_at: { _is_null: true }
        }
      ) {
        aggregate { count }
      }
    }
  `;
}

const POST = gql`
  mutation PostNewsComment($article: uuid!, $parent: uuid, $body: String!) {
    postNewsComment(article_id: $article, parent_id: $parent, body: $body) {
      id
    }
  }
`;

const EDIT = gql`
  mutation EditNewsComment($id: uuid!, $body: String!) {
    editNewsComment(id: $id, body: $body) {
      id
      text
      edited_at
    }
  }
`;

const DELETE = gql`
  mutation DeleteNewsComment($id: uuid!) {
    deleteNewsComment(id: $id) {
      success
    }
  }
`;

const VOTE = gql`
  mutation ToggleNewsCommentVote($id: uuid!) {
    toggleNewsCommentVote(id: $id) {
      comment_id
      vote_count
      voted
    }
  }
`;

const HIDE = gql`
  mutation SetNewsCommentHidden($id: uuid!, $hidden: Boolean!, $reason: String) {
    setNewsCommentHidden(id: $id, hidden: $hidden, reason: $reason) {
      id
      hidden_at
    }
  }
`;

export function useNewsComments() {
  async function fetchThreads(
    articleId: string,
    offset: number,
    options: { signedIn: boolean; staff: boolean },
    limit = NEWS_COMMENTS_PAGE,
  ) {
    const { data } = await getGraphqlClient().query({
      query: threadQuery(options),
      variables: { article: articleId, limit, offset },
      fetchPolicy: "network-only",
    });
    const result = data as {
      news_comments: NewsComment[];
      threads: { aggregate: { count: number } };
      visible: { aggregate: { count: number } };
    };
    return {
      comments: result.news_comments,
      threads: result.threads.aggregate.count,
      visible: result.visible.aggregate.count,
    };
  }

  async function post(articleId: string, body: string, parentId?: string) {
    await getGraphqlClient().mutate({
      mutation: POST,
      variables: { article: articleId, parent: parentId ?? null, body },
    });
  }

  async function edit(id: string, body: string) {
    await getGraphqlClient().mutate({ mutation: EDIT, variables: { id, body } });
  }

  async function remove(id: string) {
    await getGraphqlClient().mutate({ mutation: DELETE, variables: { id } });
  }

  async function toggleVote(id: string) {
    const { data } = await getGraphqlClient().mutate({
      mutation: VOTE,
      variables: { id },
    });
    return (
      data as {
        toggleNewsCommentVote: {
          comment_id: string;
          vote_count: number;
          voted: boolean;
        };
      }
    ).toggleNewsCommentVote;
  }

  async function setHidden(id: string, hidden: boolean, reason?: string) {
    await getGraphqlClient().mutate({
      mutation: HIDE,
      variables: { id, hidden, reason: reason || null },
    });
  }

  return { fetchThreads, post, edit, remove, toggleVote, setHidden };
}
