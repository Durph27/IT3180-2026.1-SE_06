"""Generate editable physical ERD and UML from committed migrations/OpenAPI.

The original Astah file remains a historical design artifact. Current UML is
BlueMoon_UML.drawio; Java-serialized Astah data must not be patched as raw bytes.
"""
from pathlib import Path
import html
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def physical_tables():
    sql = '\n'.join(p.read_text(encoding='utf-8') for p in sorted(
        (ROOT / 'backend/src/main/resources/db/migration').glob('*.sql')))
    tables, links = {}, []
    for name, body in re.findall(r'CREATE TABLE (\w+)\s*\((.*?)\);', sql, re.S):
        fields = re.split(r',\s*(?![^()]*\))', body.strip())
        tables[name] = [re.sub(r'\s+', ' ', f.strip()) for f in fields]
        for field in fields:
            ref = re.search(r'REFERENCES (\w+)\((\w+)\)', field)
            if ref:
                links.append((name, ref[1], field.split()[0]))
    for child, column, parent in re.findall(
            r'ALTER TABLE (\w+) ADD FOREIGN KEY \((\w+)\) REFERENCES (\w+)', sql):
        links.append((child, parent, column))
    return tables, links


def diagram(file, name, identifier):
    page = ET.SubElement(file, 'diagram', id=identifier, name=name)
    model = ET.SubElement(page, 'mxGraphModel', grid='1', page='0')
    root = ET.SubElement(model, 'root')
    ET.SubElement(root, 'mxCell', id='0')
    ET.SubElement(root, 'mxCell', id='1', parent='0')
    return root


def box(root, key, label, x, y, width=420, height=160, style=''):
    cell = ET.SubElement(root, 'mxCell', id=key, value=label, parent='1', vertex='1',
                         style='html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacing=10;fillColor=#f8fafc;strokeColor=#64748b;'+style)
    ET.SubElement(cell, 'mxGeometry', {'x': str(x), 'y': str(y), 'width': str(width), 'height': str(height), 'as': 'geometry'})


def edge(root, key, source, target, label='', style=''):
    cell = ET.SubElement(root, 'mxCell', id=key, source=source, target=target,
                         value=label, parent='1', edge='1',
                         style='edgeStyle=orthogonalEdgeStyle;html=1;'+style)
    ET.SubElement(cell, 'mxGeometry', {'relative': '1', 'as': 'geometry'})


def write(path, root):
    ET.indent(root, space='  ')
    ET.ElementTree(root).write(path, encoding='utf-8', xml_declaration=True)


def generate():
    tables, links = physical_tables()
    erd = ET.Element('mxfile', host='app.diagrams.net')
    groups = {
        '01 - Cư trú': ['building','apartment','household','household_apartment','resident','household_member','residence_change','vehicle'],
        '02 - Khoản thu': ['fee_type','fee_rate','billing_period','invoice','invoice_line','contribution_campaign','contribution'],
        '03 - Thanh toán và dịch vụ': ['payment','payment_allocation','receipt','payment_intent','payment_intent_item','provider','service_subscription','utility_bill','reconciliation','reconciliation_item'],
        '04 - Tài khoản và hạ tầng': ['app_user','app_role','app_permission','user_role','role_permission','audit_log','access_session','login_attempt','command_result','business_lock'],
        '05 - Quỹ bảo trì': ['maintenance_fund','maintenance_round','maintenance_allocation','maintenance_expense'],
    }
    for index, (name, names) in enumerate(groups.items()):
        root = diagram(erd, name, 'physical-'+str(index))
        box(root, 'note', '<b>ERD vật lý Sprint 1</b><br/>Nguồn: Flyway V1–V3. JSON snapshot lưu TEXT; FK ghi tên cột. Quan hệ qua trang tham chiếu tên bảng.<br/>app_role.code: ADMIN, MANAGER, AUTHORITY, ACCOUNTANT, RESIDENT.', 20, 10, 1440, 90)
        for i, name in enumerate(names):
            if name not in tables:
                continue
            rows = tables[name]
            refs = [f'FK {col} → {parent}.id' for child, parent, col in links if child == name]
            label = '<b>'+name+'</b><hr/>'+'<br/>'.join(html.escape(r) for r in rows+refs)
            box(root, name, label, 20+(i % 3)*510, 140+(i//3)*590, 460, 540)
        for i, (child, parent, column) in enumerate(links):
            if child in names and parent in names:
                edge(root, 'fk'+str(i), parent, child, column, 'startArrow=ERone;endArrow=ERmany;')
    write(ROOT/'docs/BlueMoon_ERD.drawio', erd)
    cache = [[re.sub('<[^>]+>', ' ', cell.get('value', ''))
              for cell in page.iter('mxCell') if cell.get('value')]
             for page in erd]
    (ROOT/'docs/.erd-text.json').write_text(
        json.dumps(cache, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    uml = ET.Element('mxfile', host='app.diagrams.net')
    root = diagram(uml, 'Vai trò và use case Sprint 1', 'roles')
    roles = [('ADMIN','Admin'),('MANAGER','Ban quản trị'),('AUTHORITY','Cơ quan chức năng'),('ACCOUNTANT','Kế toán'),('RESIDENT','Cư dân')]
    uses = ['Tài khoản / phân quyền','Quản lý hộ dân và cư trú','Tra cứu cư trú / CCCD','Khoản thu và kỳ thu','Thu tiền / biên lai / ghi chi','Quỹ bảo trì / phân bổ','Tra cứu dữ liệu hộ mình / gửi yêu cầu']
    grants = {'ADMIN':range(7),'MANAGER':[1,2,3,5],'AUTHORITY':[2],'ACCOUNTANT':[2,3,4,5],'RESIDENT':[6]}
    for i, (code, name) in enumerate(roles):
        box(root, code, name+'<br/>'+code, 30, 30+i*165, 180, 100, 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;align=center;')
    for i, name in enumerate(uses):
        box(root, 'use'+str(i), name, 600, 30+i*120, 340, 85, 'ellipse;align=center;verticalAlign=middle;')
    for role, indexes in grants.items():
        for i in indexes:
            edge(root, role+str(i), role, 'use'+str(i), style='endArrow=none;')
    root = diagram(uml, 'Luồng API và transaction', 'architecture')
    classes = ['Feature Controller','SprintApi','Contract / OpenAPI','IdentityService / Actor','FeatureHandler','Domain Service','DomainStore / JDBC','Flyway / PostgreSQL']
    for i, name in enumerate(classes):
        box(root, 'class'+str(i), '«component»<br/><b>'+name+'</b>', 20+(i%4)*330, 40+(i//4)*250, 270, 120)
    for i, (a,b,label) in enumerate([(0,1,'request'),(1,2,'validate'),(1,3,'live RBAC'),(1,4,'transaction / idempotency / audit'),(4,5,'dispatch'),(5,6,'query / update'),(6,7,'SQL constraints')]):
        edge(root,'dep'+str(i),'class'+str(a),'class'+str(b),label,'endArrow=open;dashed=1;')
    write(ROOT/'docs/BlueMoon_UML.drawio', uml)
    print(f'Generated ERD: {len(tables)} tables, {len(links)} foreign keys; UML: 5 actors.')


if __name__ == '__main__':
    generate()
