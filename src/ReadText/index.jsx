import { useEffect, useState } from 'react'
import './index.css'

export default function ReadText ({ enterAction }) {
  const [filePath, setFilePath] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [error, setError] = useState('')

  const handleOpenDialog = () => {
    const files = window.utools.showOpenDialog({
      title: '选择文档',
      filters: [
        { name: '文本文件', extensions: ['txt', 'md'] }
      ],
      properties: ['openFile']
    })
    if (!files) return
    const filePath = files[0]
    setFilePath(filePath)

    window.services.readText(filePath).then((content) => {
      setFileContent(content)
    }).catch((err) => {
      setError(err.message)
      setFileContent('')
    })
  }

  useEffect(() => {
    if (enterAction.type === 'files') {
      const filePath = enterAction.payload[0].path
      setFilePath(filePath)

      window.services.readText(filePath).then((content) => {
        setFileContent(content)
      }).catch((err) => {
        setError(err.message)
        setFileContent('')
      })
    }
  }, [enterAction])

  return (
    <div className='read-body'>
      <button className='read-button' onClick={handleOpenDialog}>
        选择文档
      </button>
      <div className='read-file'>{filePath}</div>
      {fileContent && <pre>{fileContent}</pre>}
      {error && <div className='read-error'>{error}</div>}
    </div>
  )
}
