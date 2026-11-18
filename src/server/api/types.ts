import type {
  ParentChild,
  Partnership,
  Person,
  PersonEvent,
  StoredFile,
  Tree,
} from "../../../drizzle/schema";

/** One consistent read of a tree, shared by every v1 response builder. */
export type ApiTreeData = {
  tree: Tree;
  people: Person[];
  parents: ParentChild[];
  partnerships: Partnership[];
  events: PersonEvent[];
  files: StoredFile[];
  tags: Array<{ fileId: string; personId: string }>;
};
