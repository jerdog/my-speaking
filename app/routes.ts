import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("talks/:slug", "routes/talk.tsx"),
  route("slides/*", "routes/slides.ts"),

  route("admin", "routes/admin.tsx", [
    index("routes/admin.index.tsx"),
    route("talks/new", "routes/admin.talks.new.tsx"),
    route("talks/:id/edit", "routes/admin.talks.edit.tsx"),
  ]),

  route("api/talks", "routes/api.talks.ts"),
  route("api/talks/:id", "routes/api.talk.ts"),
  route("api/talks/:id/v/:version/source", "routes/api.talk-source.ts"),
  route("api/talks/:id/v/:version/slides/:n", "routes/api.talk-slide.ts"),
] satisfies RouteConfig;
