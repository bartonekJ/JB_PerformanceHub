using Microsoft.Data.Sqlite;
using System.IO;
using System.Threading;

namespace JB.PerformanceHub.Windows.Services;

public sealed class LocalStore
{
    private static int _sqliteInitialized;
    private readonly string _connectionString;

    public LocalStore(string databasePath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
        }.ToString();
    }

    public async Task InitializeAsync()
    {
        if (Interlocked.Exchange(ref _sqliteInitialized, 1) == 0)
        {
            SQLitePCL.Batteries_V2.Init();
        }

        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS local_snapshots (
                key TEXT PRIMARY KEY NOT NULL,
                json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            """;
        await command.ExecuteNonQueryAsync();
    }

    public async Task<string?> GetAsync(string key)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT json FROM local_snapshots WHERE key = $key LIMIT 1;";
        command.Parameters.AddWithValue("$key", key);
        return await command.ExecuteScalarAsync() as string;
    }

    public async Task PutAsync(string key, string json)
    {
        await using var connection = await OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO local_snapshots (key, json, updated_at)
            VALUES ($key, $json, $updatedAt)
            ON CONFLICT(key) DO UPDATE SET
                json = excluded.json,
                updated_at = excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$json", json);
        command.Parameters.AddWithValue("$updatedAt", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        await command.ExecuteNonQueryAsync();
    }

    private async Task<SqliteConnection> OpenAsync()
    {
        var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync();
        return connection;
    }
}
