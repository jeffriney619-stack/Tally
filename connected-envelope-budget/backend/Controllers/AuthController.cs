using Backend.Contracts;
using Backend.Data;
using Backend.Models;
using Microsoft.AspNetCore.Mvc;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using BC = BCrypt.Net.BCrypt;

namespace Backend.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(BudgetDbContext database, IConfiguration config) : ControllerBase
{
    [HttpPost("signup")]
    public async Task<ActionResult<AuthResponse>> Signup([FromBody] SignupRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new AuthErrorResponse { Message = "Username and password are required." });

        if (request.Username.Length < 3 || request.Username.Length > 30)
            return BadRequest(new AuthErrorResponse { Message = "Username must be 3-30 characters." });

        if (request.Password.Length < 6)
            return BadRequest(new AuthErrorResponse { Message = "Password must be at least 6 characters." });

        // Check if username already exists
        var existingUser = database.Users.FirstOrDefault(u => u.Username == request.Username);
        if (existingUser != null)
            return Conflict(new AuthErrorResponse { Message = "Username already exists." });

        // Create new user with hashed password
        var passwordHash = BC.HashPassword(request.Password);
        var user = new User
        {
            Username = request.Username,
            PasswordHash = passwordHash,
            CreatedAt = DateTime.UtcNow
        };

        database.Users.Add(user);
        await database.SaveChangesAsync();

        var token = GenerateToken(user);
        return Ok(new AuthResponse
        {
            Token = token,
            Username = user.Username,
            ExpiresAt = DateTime.UtcNow.AddHours(24)
        });
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new AuthErrorResponse { Message = "Username and password are required." });

        var user = database.Users.FirstOrDefault(u => u.Username == request.Username);
        if (user == null || !BC.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new AuthErrorResponse { Message = "Invalid username or password." });

        var token = GenerateToken(user);
        return Ok(new AuthResponse
        {
            Token = token,
            Username = user.Username,
            ExpiresAt = DateTime.UtcNow.AddHours(24)
        });
    }

    private string GenerateToken(User user)
    {
        var key = config["JwtSecret"] ?? "your-secret-key-change-this-in-production-12345";
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(ClaimTypes.Name, user.Username),
        };

        var token = new JwtSecurityToken(
            issuer: "Tally",
            audience: "Tally",
            claims: claims,
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
