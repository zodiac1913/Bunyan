using System.Text.Json;
using Microsoft.Data.SqlClient;

// Secrets arrive only on private stdin, never arguments or files. Emit classifications, not exceptions.
try
{
    var request = JsonSerializer.Deserialize<Request>(Console.In.ReadToEnd());
    if (request is null || string.IsNullOrWhiteSpace(request.Username)
        || string.IsNullOrEmpty(request.OldPassword) || string.IsNullOrEmpty(request.NewPassword))
    {
        Console.Write("invalid_request");
        return;
    }

    var builder = request.ConnectionString is null
        ? new SqlConnectionStringBuilder
        {
            DataSource = $"tcp:{request.Host},{request.Port}",
            TrustServerCertificate = request.TrustCertificate,
        }
        : new SqlConnectionStringBuilder(request.ConnectionString);
    builder.UserID = request.Username;
    builder.Password = request.OldPassword;
    builder.IntegratedSecurity = false;
    builder.Authentication = SqlAuthenticationMethod.SqlPassword;
    builder.InitialCatalog = "master";
    builder.ApplicationIntent = ApplicationIntent.ReadWrite;
    builder.ApplicationName = "Bunyan.PasswordChange";
    builder.Pooling = false;
    builder.ConnectTimeout = 15;
    builder.ConnectRetryCount = 0;
    builder.PersistSecurityInfo = false;
    builder.Encrypt = SqlConnectionEncryptOption.Mandatory;

    // LOGIN7 password changes work even when the old password is expired or MUST_CHANGE is set.
    SqlConnection.ChangePassword(builder.ConnectionString, request.NewPassword);
    Console.Write("ok");
}
catch (SqlException error)
{
    Console.Write(error.Number switch
    {
        15116 or 15118 or 15128 => "policy",
        18456 or 18487 or 18488 or 15211 => "authentication",
        -2 or 53 or 10060 or 10061 => "connection",
        _ => "rejected",
    });
}
catch (Exception error) when (error is ArgumentException or JsonException or InvalidOperationException)
{
    Console.Write("invalid_request");
}

internal sealed record Request(
    string? ConnectionString, string Host, ushort Port, bool TrustCertificate,
    string Username, string OldPassword, string NewPassword);
