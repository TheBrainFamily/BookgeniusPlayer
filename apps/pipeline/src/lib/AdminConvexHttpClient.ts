/**
 * Admin-authenticated Convex HTTP client for scripts.
 *
 * Drop-in replacement for ConvexHttpClient that automatically adds
 * the admin key to all function calls, bypassing JWT authentication.
 *
 * Note: The admin key is passed in args. All publicQuery/publicMutation/adminQuery
 * functions accept _adminKey in their validators, so it won't appear in validation errors.
 */
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";

export class AdminConvexHttpClient {
  private client: ConvexHttpClient;
  private adminKey: string;

  constructor(url: string, adminKey?: string) {
    this.client = new ConvexHttpClient(url);
    this.adminKey = adminKey ?? process.env.CONVEX_ADMIN_KEY ?? "";

    if (!this.adminKey) {
      console.warn("AdminConvexHttpClient: CONVEX_ADMIN_KEY not set, requests may fail");
    }
  }

  /**
   * Run a Convex query with admin authentication.
   */
  async query<Query extends FunctionReference<"query">>(
    query: Query,
    args: Omit<FunctionArgs<Query>, "_adminKey"> = {} as Omit<FunctionArgs<Query>, "_adminKey">,
  ): Promise<FunctionReturnType<Query>> {
    return this.client.query(query, { ...args, _adminKey: this.adminKey } as FunctionArgs<Query>);
  }

  /**
   * Run a Convex mutation with admin authentication.
   */
  async mutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    args: Omit<FunctionArgs<Mutation>, "_adminKey"> = {} as Omit<
      FunctionArgs<Mutation>,
      "_adminKey"
    >,
  ): Promise<FunctionReturnType<Mutation>> {
    return this.client.mutation(mutation, {
      ...args,
      _adminKey: this.adminKey,
    } as FunctionArgs<Mutation>);
  }

  /**
   * Run a Convex action with admin authentication.
   */
  async action<Action extends FunctionReference<"action">>(
    action: Action,
    args: Omit<FunctionArgs<Action>, "_adminKey"> = {} as Omit<FunctionArgs<Action>, "_adminKey">,
  ): Promise<FunctionReturnType<Action>> {
    return this.client.action(action, {
      ...args,
      _adminKey: this.adminKey,
    } as FunctionArgs<Action>);
  }
}
