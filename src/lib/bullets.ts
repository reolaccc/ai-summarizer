export type BulletNode = {
  text: string;
  level: number;
};

export type BulletTreeNode = BulletNode & {
  children: BulletTreeNode[];
};

export function normalizeBulletNodes(
  items: Array<string | { text?: string; level?: number }>,
): BulletNode[] {
  return items
    .map((item) => {
      if (typeof item === "string") {
        return { text: item.trim(), level: 0 };
      }

      const text = typeof item?.text === "string" ? item.text.trim() : "";
      const rawLevel = typeof item?.level === "number" ? item.level : 0;
      const level = Number.isFinite(rawLevel) ? Math.max(0, Math.min(3, Math.floor(rawLevel))) : 0;

      return { text, level };
    })
    .filter((item) => item.text);
}

export function buildBulletTree(nodes: BulletNode[]): BulletTreeNode[] {
  const roots: BulletTreeNode[] = [];
  const stack: BulletTreeNode[] = [];

  for (const node of nodes) {
    const treeNode: BulletTreeNode = { ...node, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= treeNode.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(treeNode);
    } else {
      stack[stack.length - 1].children.push(treeNode);
    }

    stack.push(treeNode);
  }

  return roots;
}

export function formatBulletNodes(nodes: BulletNode[]) {
  return nodes.map((node) => `${"  ".repeat(node.level)}- ${node.text}`).join("\n");
}
