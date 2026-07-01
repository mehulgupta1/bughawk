// AST-based endpoint extraction — the piece pure regex can't do.
// Resolves string concatenations ("/api/" + region + "/users"), template literals
// (`/api/${v}/x`), and the URL arg of fetch/axios/$.ajax/useSWR/etc., recovering
// the STATIC skeleton of endpoints that are built at runtime.
//
// Pure & DOM-free so it runs in the worker. Parse failures and oversized files
// degrade gracefully (regex path still ran).
import { Parser } from 'acorn';
import { simple } from 'acorn-walk';

const MAX_BYTES = 2_000_000; // AST parse + walk is heavy; skip giant bundles (regex already covered them)
const DYN = '«DYN»'; // placeholder for a non-static expression part

// Fold a node into a static string skeleton, marking dynamic parts with DYN.
// Returns null when there's no useful static content.
function staticOf(node) {
  if (!node) return null;
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? node.value : (node.value == null ? null : String(node.value));
    case 'TemplateLiteral': {
      let out = '';
      for (let i = 0; i < node.quasis.length; i++) {
        out += node.quasis[i].value.cooked ?? '';
        if (i < node.expressions.length) out += DYN;
      }
      return out;
    }
    case 'BinaryExpression': {
      if (node.operator !== '+') return null;
      const l = staticOf(node.left);
      const r = staticOf(node.right);
      if (l == null && r == null) return null;
      return (l == null ? DYN : l) + (r == null ? DYN : r);
    }
    case 'Identifier':
    case 'MemberExpression':
    case 'CallExpression':
      return DYN; // dynamic — keep position but no value
    default:
      return null;
  }
}

// Keep only skeletons that actually look like a URL or a path.
function looksLikeEndpoint(s) {
  if (!s) return false;
  const cleaned = s.replace(new RegExp(DYN, 'g'), '');
  if (cleaned.length < 3) return false;
  return /^(?:[a-z][a-z0-9+.\-]*:\/\/|\/)/i.test(s) || /\/(?:api|v\d|graphql|rest|gql|rpc|internal|auth|oauth|admin|user|account|webhook)\b/i.test(s);
}

const CALL_NAMES = /^(?:fetch|axios|request|got|ky|\$|useSWR|useFetch|useQuery|openConnection)$/;
const CALL_METHODS = /^(?:get|post|put|patch|delete|head|options|request|ajax|getJSON|query|mutate)$/;

function calleeIsFetchLike(callee) {
  if (!callee) return false;
  if (callee.type === 'Identifier') return CALL_NAMES.test(callee.name);
  if (callee.type === 'MemberExpression') {
    const prop = callee.property && (callee.property.name || callee.property.value);
    if (prop && CALL_METHODS.test(String(prop))) return true;
    const obj = callee.object && callee.object.name;
    if (obj && CALL_NAMES.test(obj)) return true;
  }
  return false;
}

// Returns deduped endpoint skeletons. Dynamic parts render as the DYN sentinel,
// which the caller can normalize (we expose it as a readable token).
export function astEndpoints(text) {
  if (!text || text.length > MAX_BYTES) return [];
  let ast;
  try {
    ast = Parser.parse(text, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true });
  } catch {
    try {
      ast = Parser.parse(text, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
    } catch {
      return []; // unparseable (e.g. exotic syntax) — regex path already ran
    }
  }

  const found = new Set();
  const consider = (node) => {
    const sk = staticOf(node);
    if (sk && looksLikeEndpoint(sk)) found.add(sk.replace(new RegExp(DYN, 'g'), '{x}'));
  };

  simple(ast, {
    // concatenations / templates anywhere (catch assignments like const u = base + "/api/x")
    BinaryExpression: consider,
    TemplateLiteral: consider,
    // first argument of fetch-like calls
    CallExpression(node) {
      if (calleeIsFetchLike(node.callee) && node.arguments.length) consider(node.arguments[0]);
    },
  });

  return [...found];
}
