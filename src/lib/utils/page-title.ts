export const getTitleFromPathname = (pathname: string) => {
  switch (pathname) {
    case "/dashboard":
      return "Dashboard | DreamDash";
    case "/calendar":
      return "Calendar | DreamDash";
    case "/tasks":
      return "Tasks | DreamDash";
    case "/email":
      return "Email | DreamDash";
    case "/notes":
      return "Notes | DreamDash";
    case "/focus":
      return "Focus | DreamDash";
    case "/settings":
      return "Settings | DreamDash";
    case "/setup":
      return "Setup | DreamDash";
    case "/auth/signin":
      return "Sign In | DreamDash";
    case "/auth/signup":
      return "Sign Up | DreamDash";
    case "/auth/reset-password":
      return "Reset Password | DreamDash";
    default:
      return "DreamDash";
  }
};
