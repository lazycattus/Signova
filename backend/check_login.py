from getpass import getpass

from app import app


def main():
    with app.test_client() as client:
        response = client.get("/api/auth/me")
        print("Before login:", response.status_code)
        if response.status_code != 401:
            print("Unexpected result. Stop and check this first.")
            return

        response = client.get("/api/auth/csrf")
        if response.status_code != 200:
            print("Could not prepare login:", response.status_code)
            return

        token = response.get_json()["csrf_token"]

        username = input("Username [demo_admin]: ").strip()
        username = username or "demo_admin"
        password = getpass("Admin password: ")

        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
            headers={"X-CSRFToken": token},
        )
        del password

        print("Login:", response.status_code)

        if response.status_code != 200:
            print(response.get_json().get("error", "Login failed."))
            return

        login_result = response.get_json()
        token = login_result["csrf_token"]
        print("Signed in as:", login_result["user"]["username"])

        response = client.get("/api/auth/me")
        print("Check signed-in account:", response.status_code)
        if response.status_code != 200:
            return

        response = client.post(
            "/api/auth/logout",
            headers={"X-CSRFToken": token},
        )
        print("Logout:", response.status_code)
        if response.status_code != 200:
            return

        response = client.get("/api/auth/me")
        print("After logout:", response.status_code)

        if response.status_code == 401:
            print("Login and logout checks passed.")


if __name__ == "__main__":
    main()