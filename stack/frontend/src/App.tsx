import { useState } from 'react'
import axios from 'axios'
import './index.css'

interface QueryResult {
    [key: string]: any
}

function App() {
    const [sql, setSql] = useState('SELECT 1 as result')
    const [results, setResults] = useState<QueryResult[]>([])
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleExecute = async () => {
        console.log('Starting execution...')
        setLoading(true)
        setError(null)
        setResults([])
        try {
            console.log('Sending request to http://localhost:8080/query')
            const response = await axios.post('http://localhost:8080/query', { sql })
            console.log('Response received:', response.data)
            setResults(response.data)
        } catch (err: any) {
            console.error('Execution error:', err)
            setError(err.response?.data || err.message || 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="container">
            <h1>SQL Executor</h1>
            <div className="input-group">
                <textarea
                    value={sql}
                    onChange={(e) => setSql(e.target.value)}
                    rows={5}
                    className="sql-input"
                    placeholder="Enter SQL query..."
                />
            </div>
            <button onClick={handleExecute} disabled={loading} className="execute-btn">
                {loading ? 'Executing...' : 'Run Query'}
            </button>

            {error && <div className="error-message">{error}</div>}

            {results.length > 0 && (
                <div className="results-table-container">
                    <table className="results-table">
                        <thead>
                            <tr>
                                {Object.keys(results[0]).map((key) => (
                                    <th key={key}>{key}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((row, i) => (
                                <tr key={i}>
                                    {Object.values(row).map((val: any, j) => (
                                        <td key={j}>{JSON.stringify(val)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {results.length === 0 && !loading && !error && <p>No results to display</p>}
        </div>
    )
}

export default App
