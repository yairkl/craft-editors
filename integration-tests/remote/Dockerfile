FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends openssh-server ca-certificates curl tar gzip libstdc++6 && rm -rf /var/lib/apt/lists/* && useradd -m -s /bin/bash crafttest && passwd -d crafttest && mkdir -p /run/sshd /home/crafttest/.ssh /home/crafttest/workspace && chmod 700 /home/crafttest/.ssh
COPY authorized_keys /home/crafttest/.ssh/authorized_keys
RUN chmod 600 /home/crafttest/.ssh/authorized_keys && chown -R crafttest:crafttest /home/crafttest && ssh-keygen -A && printf '\nPasswordAuthentication no\nPermitRootLogin no\n' >> /etc/ssh/sshd_config
CMD ["/usr/sbin/sshd", "-D", "-e"]
