import './index.css'

export default function Hello ({ enterAction }) {
  return (
    <div className='hello'>
      <h1>Hi, uTools</h1>
      <h2>插件应用进入参数</h2>
      <pre>
        {JSON.stringify(enterAction, null, 2)}
      </pre>
    </div>
  )
}
