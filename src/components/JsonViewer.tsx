export default function JsonViewer({data}:{data:unknown}){return <pre className="json-viewer">{JSON.stringify(data,null,2)}</pre>}
